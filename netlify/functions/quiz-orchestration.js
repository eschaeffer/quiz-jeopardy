const { retrieveCurriculumContext, formatExpectationsForPrompt, assessNarrowTopicRelevance } = require('./curriculum');
const { buildCurriculumPrompt } = require('./quiz-prompt-utils');
const { detectSubjectFamily } = require('./quiz-subject-detection');
const { requestNarrowTopicValidation } = require('./quiz-curriculum-validator');
const { assembleQuizDraft } = require('./quiz-assembler');
const { getCreditBalance, initializeCredits, decrementCredit } = require('./supabase-credits');
const { validateLicenseKeyServer, isDevLicenseKey } = require('./license-server-utils');

const DEFAULT_MODEL = 'openai/gpt-5.4-mini';
const DEV_ALLOWED_MODELS = new Set([
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'anthropic/claude-sonnet-4',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
]);

function createHandledError(statusCode, message, code, type, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.type = type;
  error.extra = extra;
  return error;
}

function parseJsonBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch (e) {
    throw createHandledError(400, 'Request body must be valid JSON', 'BAD_REQUEST_JSON', 'request_error', {
      raw: event.body?.substring(0, 2000) || '',
    });
  }
}

function ensureBaseGenerationPayload(payload) {
  if (!payload?.topic || !Number.isFinite(payload?.categories) || !Number.isFinite(payload?.questionsPerCategory)) {
    throw createHandledError(400, 'topic, categories, and questionsPerCategory are required', 'BAD_REQUEST', 'request_error');
  }
}

function ensureLicenseKeyProvided(payload) {
  if (!payload?.license_key) {
    throw createHandledError(400, 'license_key is required', 'BAD_REQUEST', 'request_error');
  }
}

function ensureApiKeyConfigured() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw createHandledError(500, 'OpenRouter API key is not configured', 'MISSING_OPENROUTER_API_KEY', 'configuration_error');
  }
}

function isDevModelSelectionAllowed(event) {
  const context = String(process.env.CONTEXT || '').toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const host = String(event?.headers?.host || event?.headers?.Host || '').toLowerCase();
  return context === 'dev' || nodeEnv === 'development' || host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
}

function resolveGenerationModel(requestedModel, allowDevSelection) {
  const normalizedRequestedModel = String(requestedModel || '').trim();
  if (!allowDevSelection || !normalizedRequestedModel) {
    return DEFAULT_MODEL;
  }
  if (!DEV_ALLOWED_MODELS.has(normalizedRequestedModel)) {
    throw createHandledError(400, `Unsupported model: ${normalizedRequestedModel}`, 'UNSUPPORTED_MODEL', 'request_error', {
      model: normalizedRequestedModel,
    });
  }
  return normalizedRequestedModel;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);
  const cost = Number(usage.cost) || 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost,
  };
}

function buildUsageEntry(stage, model, usage, extra = {}) {
  const normalizedUsage = normalizeUsage(usage);
  if (!normalizedUsage) return null;
  return {
    stage,
    model,
    ...extra,
    ...normalizedUsage,
  };
}

function summarizeUsage(entries) {
  const validEntries = (entries || []).filter(Boolean);
  return {
    prompt_tokens: validEntries.reduce((sum, entry) => sum + (entry.prompt_tokens || 0), 0),
    completion_tokens: validEntries.reduce((sum, entry) => sum + (entry.completion_tokens || 0), 0),
    total_tokens: validEntries.reduce((sum, entry) => sum + (entry.total_tokens || 0), 0),
    total_cost_usd: Number(validEntries.reduce((sum, entry) => sum + (entry.cost || 0), 0).toFixed(6)),
    call_count: validEntries.length,
    calls: validEntries,
  };
}

async function getOrInitializeCreditBalance(licenseKey, event = null) {
  if (isDevLicenseKey(licenseKey)) {
    return {
      license_key: licenseKey,
      tier_name: 'dev',
      credits_total: null,
      credits_remaining: null,
      credits_used: 0,
      is_unlimited: true,
    };
  }

  let balance = await getCreditBalance(licenseKey);
  if (balance) return balance;

  const validated = await validateLicenseKeyServer(licenseKey, event);
  if (!validated.valid || !validated.productId) {
    throw createHandledError(400, 'Could not initialize credits for this license key', 'INVALID_LICENSE', 'request_error');
  }

  return initializeCredits(licenseKey, validated.productId);
}

function ensureCreditsAvailable(balance) {
  if (balance?.is_unlimited) return;
  if (!balance || Number(balance.credits_remaining) <= 0) {
    throw createHandledError(
      402,
      'No quiz generations remaining. Purchase a refill to continue.',
      'GENERATIONS_EXHAUSTED',
      'credits_error',
      {
        errorType: 'GENERATIONS_EXHAUSTED',
        credits_remaining: 0,
      }
    );
  }
}

async function decrementCreditAfterSuccess(licenseKey) {
  if (isDevLicenseKey(licenseKey)) {
    return {
      license_key: licenseKey,
      tier_name: 'dev',
      credits_total: null,
      credits_remaining: null,
      credits_used: 0,
      is_unlimited: true,
    };
  }

  return decrementCredit(licenseKey);
}

function buildCurriculumContextPayload(curriculum, selectedConcept, expectations, narrowTopicContext) {
  if (!selectedConcept && expectations.length === 0) return null;

  return {
    curriculum_id: curriculum.curriculum_id || curriculum.curriculumId || 'ontario',
    selected_concept: selectedConcept ? {
      id: selectedConcept.id,
      name: selectedConcept.name,
      description: selectedConcept.description,
      related_expectations: selectedConcept.related_expectations,
    } : null,
    selected_focus_area: selectedConcept ? {
      id: selectedConcept.id,
      name: selectedConcept.name,
      description: selectedConcept.description,
      related_expectations: selectedConcept.related_expectations,
    } : null,
    narrow_topic: narrowTopicContext,
    matched_expectations: expectations.map((expectation) => ({
      id: expectation.id,
      course_code: expectation.course_code,
      grade: expectation.grade,
      subject_area: expectation.subject_area,
      strand_id: expectation.strand_id,
      strand_name: expectation.strand_name,
      expectation_code: expectation.expectation_code,
      source_document: expectation.source_document,
      source_url: expectation.source_url,
      version_year: expectation.version_year,
      retrieval_score: expectation.retrieval_score,
    })),
  };
}

async function resolveGenerationSetup({ event, payload, requestCategoryPlan }) {
  ensureApiKeyConfigured();
  ensureBaseGenerationPayload(payload);
  ensureLicenseKeyProvided(payload);

  const allowDevModelSelection = isDevModelSelectionAllowed(event);
  const requestedModel = String(payload.model || '').trim() || DEFAULT_MODEL;
  const generationModel = resolveGenerationModel(payload.model, allowDevModelSelection);
  const creditBalance = await getOrInitializeCreditBalance(payload.license_key, event);
  ensureCreditsAvailable(creditBalance);
  const curriculum = payload.curriculum || null;
  const focusAreaId = curriculum?.concept_id || curriculum?.conceptId || null;
  const focusAreaName = curriculum?.concept_name || curriculum?.conceptName || null;
  const focusAreaDescription = curriculum?.concept_description || curriculum?.conceptDescription || '';
  const narrowTopicInput = String(curriculum?.narrow_topic || curriculum?.narrowTopic || '').trim();

  let acceptedNarrowTopic = '';
  let narrowTopicContext = null;
  let narrowTopicValidationUsage = null;

  if (curriculum && narrowTopicInput && (focusAreaId || focusAreaName)) {
    const heuristic = assessNarrowTopicRelevance({
      curriculumId: curriculum.curriculum_id || curriculum.curriculumId || 'ontario',
      courseCode: curriculum.course_code || curriculum.courseCode,
      grade: curriculum.grade,
      subjectArea: curriculum.subject_area || curriculum.subjectArea,
      conceptId: focusAreaId,
      conceptName: focusAreaName,
      narrowTopic: narrowTopicInput,
    });

    if (heuristic.status === 'accepted') {
      acceptedNarrowTopic = narrowTopicInput;
      narrowTopicContext = {
        input: narrowTopicInput,
        accepted: true,
        mode: 'heuristic',
        warning: '',
        reason: '',
      };
    } else if (heuristic.status === 'rejected') {
      narrowTopicContext = {
        input: narrowTopicInput,
        accepted: false,
        mode: 'heuristic',
        warning: `The narrow topic "${narrowTopicInput}" did not closely match the selected focus area, so it was ignored.`,
        reason: 'No strong curriculum-match signal was found for the narrow topic within the selected focus area.',
      };
    } else if (heuristic.status === 'ambiguous') {
      try {
        const aiValidation = await requestNarrowTopicValidation({
          apiKey: process.env.OPENROUTER_API_KEY,
          model: DEFAULT_MODEL,
          courseCode: curriculum.course_code || curriculum.courseCode,
          subjectArea: curriculum.subject_area || curriculum.subjectArea,
          focusArea: {
            id: focusAreaId,
            name: focusAreaName,
            description: focusAreaDescription,
          },
          narrowTopic: narrowTopicInput,
          sampledExpectations: heuristic.sampledExpectations,
        });

        narrowTopicValidationUsage = buildUsageEntry(
          'narrow_topic_validation',
          aiValidation.routedModel || DEFAULT_MODEL,
          aiValidation.usage,
          { mode: 'ai' }
        );

        if (aiValidation.aligned) {
          acceptedNarrowTopic = narrowTopicInput;
          narrowTopicContext = {
            input: narrowTopicInput,
            accepted: true,
            mode: 'ai',
            warning: '',
            reason: aiValidation.reason,
          };
        } else {
          narrowTopicContext = {
            input: narrowTopicInput,
            accepted: false,
            mode: 'ai',
            warning: `The narrow topic "${narrowTopicInput}" did not closely match the selected focus area, so it was ignored.`,
            reason: aiValidation.reason,
          };
        }
      } catch (error) {
        narrowTopicContext = {
          input: narrowTopicInput,
          accepted: false,
          mode: 'ai_error',
          warning: `The narrow topic "${narrowTopicInput}" could not be validated against the selected focus area, so it was ignored.`,
          reason: error.message,
        };
      }
    }
  }

  const generationTopic = curriculum
    ? [focusAreaName, acceptedNarrowTopic].filter(Boolean).join(': ')
    : payload.topic;

  const retrievedCurriculum = curriculum ? retrieveCurriculumContext({
    curriculumId: curriculum.curriculum_id || curriculum.curriculumId || 'ontario',
    courseCode: curriculum.course_code || curriculum.courseCode,
    grade: curriculum.grade,
    subjectArea: curriculum.subject_area || curriculum.subjectArea,
    topic: acceptedNarrowTopic,
    conceptId: focusAreaId,
    conceptName: focusAreaName,
    limit: curriculum.limit || 6,
  }) : { concept: null, expectations: [] };

  const expectations = retrievedCurriculum.expectations;
  const selectedConcept = retrievedCurriculum.concept;
  const curriculumPrompt = buildCurriculumPrompt(formatExpectationsForPrompt(expectations, selectedConcept));
  const subjectFamily = detectSubjectFamily({ topic: generationTopic, curriculum });
  const categoryPlan = await requestCategoryPlan({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: generationModel,
    topic: generationTopic,
    categories: payload.categories,
    questionsPerCategory: payload.questionsPerCategory,
    subjectFamily,
    curriculumPrompt,
  });

  return {
    topic: payload.topic,
    license_key: payload.license_key,
    curriculum,
    categories: payload.categories,
    questionsPerCategory: payload.questionsPerCategory,
    requested_model: requestedModel,
    resolved_model: generationModel,
    narrow_topic_validator_model: DEFAULT_MODEL,
    generationTopic,
    subjectFamily,
    curriculumPrompt,
    categoryPlan,
    narrowTopicValidationUsage,
    curriculumContext: buildCurriculumContextPayload(curriculum || {}, selectedConcept, expectations, narrowTopicContext),
    credit_balance: creditBalance,
  };
}

function buildQuizFromStageResults({ setup, round1, round2, finalData, round1Verification, round2Verification, finalVerification }) {
  const usageEntries = [
    setup.narrowTopicValidationUsage || null,
    buildUsageEntry('planner', setup.categoryPlan?.routedModel || setup.resolved_model, setup.categoryPlan?.usage),
    ...(round1 || []).map((category, index) => buildUsageEntry('category_generation', category.routedModel || setup.resolved_model, category.usage, {
      round: 'Round 1',
      category: category.name,
      index,
    })),
    ...(round2 || []).map((category, index) => buildUsageEntry('category_generation', category.routedModel || setup.resolved_model, category.usage, {
      round: 'Round 2',
      category: category.name,
      index,
    })),
    buildUsageEntry('final_generation', finalData?.routedModel || setup.resolved_model, finalData?.usage),
    ...(round1Verification || []).map((verification, index) => buildUsageEntry('category_verification', verification.routedModel || setup.resolved_model, verification.usage, {
      round: 'Round 1',
      category: round1[index]?.name || `Category ${index + 1}`,
      index,
    })),
    ...(round2Verification || []).map((verification, index) => buildUsageEntry('category_verification', verification.routedModel || setup.resolved_model, verification.usage, {
      round: 'Round 2',
      category: round2[index]?.name || `Category ${index + 1}`,
      index,
    })),
    buildUsageEntry('final_verification', finalVerification?.routedModel || setup.resolved_model, finalVerification?.usage),
  ];

  const verifiedRound1 = (round1 || []).map((category, index) => ({
    ...category,
    verification: round1Verification[index],
  }));
  const verifiedRound2 = (round2 || []).map((category, index) => ({
    ...category,
    verification: round2Verification[index],
  }));
  const verifiedFinalData = {
    ...finalData,
    verification: finalVerification,
  };

  return assembleQuizDraft({
    categoryPlan: {
      subjectFamily: setup.subjectFamily,
      round1: setup.categoryPlan.round1,
      round2: setup.categoryPlan.round2,
    },
    generatedRounds: { round1: verifiedRound1, round2: verifiedRound2 },
    finalData: verifiedFinalData,
    generationMetadata: {
      requested_model: setup.requested_model,
      resolved_model: setup.resolved_model,
      narrow_topic_validator_model: setup.narrow_topic_validator_model,
      planner_model: setup.categoryPlan.routedModel || setup.resolved_model,
      round1_models: verifiedRound1.map((category) => category.routedModel || setup.resolved_model),
      round2_models: verifiedRound2.map((category) => category.routedModel || setup.resolved_model),
      final_model: verifiedFinalData.routedModel || setup.resolved_model,
      usage: summarizeUsage(usageEntries),
    },
    curriculumContext: setup.curriculumContext,
  });
}

function attachCreditBalanceToQuiz(quiz, balance) {
  if (!balance) return quiz;

  return {
    ...quiz,
    credits_remaining: balance.is_unlimited ? null : balance.credits_remaining,
    credit_balance: balance,
  };
}

module.exports = {
  DEFAULT_MODEL,
  DEV_ALLOWED_MODELS,
  createHandledError,
  parseJsonBody,
  ensureBaseGenerationPayload,
  ensureLicenseKeyProvided,
  ensureApiKeyConfigured,
  isDevModelSelectionAllowed,
  resolveGenerationModel,
  normalizeUsage,
  buildUsageEntry,
  summarizeUsage,
  getOrInitializeCreditBalance,
  ensureCreditsAvailable,
  decrementCreditAfterSuccess,
  resolveGenerationSetup,
  buildQuizFromStageResults,
  attachCreditBalanceToQuiz,
};
