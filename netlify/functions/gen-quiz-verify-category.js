const { requestCategoryVerification } = require('./quiz-verifier');
const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { parseJsonBody, createHandledError, ensureApiKeyConfigured } = require('./quiz-orchestration');

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
    ensureApiKeyConfigured();
    const payload = parseJsonBody(event);
    if (!payload?.model || !payload?.topic || !payload?.roundName || !payload?.categoryName || !payload?.subjectFamily || !payload?.generatedCategory) {
      throw createHandledError(400, 'model, topic, roundName, categoryName, subjectFamily, and generatedCategory are required', 'BAD_REQUEST', 'request_error');
    }

    return jsonResponse(200, await requestCategoryVerification({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: payload.model,
      topic: payload.topic,
      roundName: payload.roundName,
      categoryName: payload.categoryName,
      subjectFamily: payload.subjectFamily,
      curriculumPrompt: payload.curriculumPrompt || '',
      generatedCategory: payload.generatedCategory,
    }));
  } catch (error) {
    return errorResponse(
      error.statusCode || 500,
      error.message,
      error.code || 'CATEGORY_VERIFICATION_ERROR',
      error.type || 'server_error',
      error.extra || { details: error.message, model: '' }
    );
  }
};
