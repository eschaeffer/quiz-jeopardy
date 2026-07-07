const { createChatCompletion } = require('./quiz-openrouter');
const { parseModelJsonContent, objectHasBrokenLegacyMathMarkers } = require('./quiz-generation-utils');
const { buildFinalGenerationPrompt } = require('./quiz-prompt-utils');
const { auditFinalGeneration, buildBoardSummary, getBlockingQualityIssues } = require('./quiz-quality');

function normalizeFinalOption(option = {}) {
  return {
    category: option.category || 'Final Showdown',
    question: option.question || option.clue || '',
    answer: option.answer || '',
    confidence: Number(option.confidence) || 0.8,
  };
}

function validateFinalOption(option, label) {
  if (!option || typeof option !== 'object') {
    throw new Error(`${label} is missing`);
  }
  if (typeof option.category !== 'string' || !option.category.trim()) {
    throw new Error(`${label} is missing a valid category`);
  }
  if (!option.question && !option.clue) {
    throw new Error(`${label} is missing clue text`);
  }
  if (!option.answer) {
    throw new Error(`${label} is missing answer text`);
  }
}

function validateFinalGenerationShape(parsed, boardSummaryText = '') {
  validateFinalOption(parsed?.activeFinal, 'Active final option');
  if (!Array.isArray(parsed?.bankFinals) || parsed.bankFinals.length !== 2) {
    throw new Error('Final generation must return exactly 2 bank final options');
  }
  parsed.bankFinals.forEach((option, index) => validateFinalOption(option, `Bank final option ${index + 1}`));
  if (objectHasBrokenLegacyMathMarkers(parsed)) {
    throw new Error('Final generation contains malformed legacy math markers');
  }
  const qualityAudit = auditFinalGeneration(parsed, { boardSummaryText });
  const blockingIssues = getBlockingQualityIssues(qualityAudit.issues);
  if (blockingIssues.length > 0) {
    throw new Error(`Final generation failed quality audit: ${blockingIssues.join('; ')}`);
  }
}

async function requestFinalGeneration({ apiKey, model, topic, subjectFamily, curriculumPrompt, categoryPlan = null, generatedRounds = null }) {
  const boardSummaryText = generatedRounds ? buildBoardSummary([generatedRounds.round1 || {}, generatedRounds.round2 || {}]) : '';
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const prompt = buildFinalGenerationPrompt({
        topic,
        subjectFamily,
        curriculumPrompt,
        categoryPlan,
        boardSummary: boardSummaryText,
        retryFeedback: attempt > 0 && lastError ? lastError.message : '',
      });
      const response = await createChatCompletion({
        apiKey,
        model,
        messages: [
          { role: 'system', content: 'You generate Final Showdown options. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        maxTokens: 4000,
      });

      const rawText = await response.text();
      let jsonResponse;
      try {
        jsonResponse = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        throw new Error(`Final generation returned non-JSON API response: ${error.message}`);
      }

      if (!response.ok) {
        throw new Error(jsonResponse?.error?.message || jsonResponse?.message || response.statusText || 'Final generation request failed');
      }

      const content = jsonResponse?.choices?.[0]?.message?.content || '';
      const parsed = parseModelJsonContent(content);
      validateFinalGenerationShape(parsed, boardSummaryText);

      return {
        activeFinal: normalizeFinalOption(parsed.activeFinal),
        bankFinals: (parsed.bankFinals || []).map(normalizeFinalOption),
        routedModel: jsonResponse.model || model,
        usage: jsonResponse.usage || null,
        rawContent: String(content).slice(0, 2000),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

module.exports = {
  requestFinalGeneration,
};
