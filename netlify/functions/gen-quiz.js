const { requestCategoryPlan } = require('./quiz-category-planner');
const { requestCategoryGeneration } = require('./quiz-category-generator');
const { requestFinalGeneration } = require('./quiz-final-generator');
const { requestCategoryVerification, requestFinalVerification } = require('./quiz-verifier');
const { buildBoardSummary } = require('./quiz-quality');
const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { parseJsonBody, resolveGenerationSetup, buildQuizFromStageResults, decrementCreditAfterSuccess, attachCreditBalanceToQuiz } = require('./quiz-orchestration');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', 'request_error');
  }

  try {
    const payload = parseJsonBody(event);
    const setup = await resolveGenerationSetup({ event, payload, requestCategoryPlan });

    const round1Requests = setup.categoryPlan.round1.map((category) => requestCategoryGeneration({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: setup.resolved_model,
      topic: setup.generationTopic,
      roundName: 'Round 1',
      category,
      questionsPerCategory: setup.questionsPerCategory,
      curriculumPrompt: setup.curriculumPrompt,
    }));
    const round2Requests = setup.categoryPlan.round2.map((category) => requestCategoryGeneration({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: setup.resolved_model,
      topic: setup.generationTopic,
      roundName: 'Round 2',
      category,
      questionsPerCategory: setup.questionsPerCategory,
      curriculumPrompt: setup.curriculumPrompt,
    }));
    const [round1, round2] = await Promise.all([
      Promise.all(round1Requests),
      Promise.all(round2Requests),
    ]);

    const finalData = await requestFinalGeneration({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: setup.resolved_model,
      topic: setup.topic,
      subjectFamily: setup.subjectFamily,
      curriculumPrompt: setup.curriculumPrompt,
      categoryPlan: setup.categoryPlan,
      generatedRounds: {
        round1: { categories: round1 },
        round2: { categories: round2 },
      },
    });

    const round1VerificationRequests = round1.map((category) => requestCategoryVerification({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: setup.resolved_model,
      topic: setup.generationTopic,
      roundName: 'Round 1',
      categoryName: category.name,
      subjectFamily: setup.subjectFamily,
      curriculumPrompt: setup.curriculumPrompt,
      generatedCategory: category,
    }));
    const round2VerificationRequests = round2.map((category) => requestCategoryVerification({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: setup.resolved_model,
      topic: setup.generationTopic,
      roundName: 'Round 2',
      categoryName: category.name,
      subjectFamily: setup.subjectFamily,
      curriculumPrompt: setup.curriculumPrompt,
      generatedCategory: category,
    }));
    const finalVerificationRequest = requestFinalVerification({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: setup.resolved_model,
      topic: setup.generationTopic,
      subjectFamily: setup.subjectFamily,
      curriculumPrompt: setup.curriculumPrompt,
      generatedFinal: finalData,
      boardSummary: buildBoardSummary([
        { categories: round1 },
        { categories: round2 },
      ]),
    });

    const [round1Verification, round2Verification, finalVerification] = await Promise.all([
      Promise.all(round1VerificationRequests),
      Promise.all(round2VerificationRequests),
      finalVerificationRequest,
    ]);

    const quiz = buildQuizFromStageResults({
      setup,
      round1,
      round2,
      finalData,
      round1Verification,
      round2Verification,
      finalVerification,
    });

    let updatedBalance = setup.credit_balance || null;
    try {
      updatedBalance = await decrementCreditAfterSuccess(setup.license_key);
    } catch (decrementError) {
      console.warn('Credit decrement failed after successful generation', decrementError);
    }

    return jsonResponse(200, attachCreditBalanceToQuiz(quiz, updatedBalance));
  } catch (error) {
    return errorResponse(
      error.statusCode || 500,
      error.message === 'Failed to fetch' ? 'Could not reach OpenRouter' : error.message || 'Failed to generate quiz JSON',
      error.code || 'GEN_QUIZ_ERROR',
      error.type || 'server_error',
      error.extra || { details: error.message, model: '' }
    );
  }
};
