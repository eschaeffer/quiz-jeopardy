const { requestFinalVerification } = require('./quiz-verifier');
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
    if (!payload?.model || !payload?.topic || !payload?.subjectFamily || !payload?.generatedFinal) {
      throw createHandledError(400, 'model, topic, subjectFamily, and generatedFinal are required', 'BAD_REQUEST', 'request_error');
    }

    return jsonResponse(200, await requestFinalVerification({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: payload.model,
      topic: payload.topic,
      subjectFamily: payload.subjectFamily,
      curriculumPrompt: payload.curriculumPrompt || '',
      generatedFinal: payload.generatedFinal,
    }));
  } catch (error) {
    return errorResponse(
      error.statusCode || 500,
      error.message,
      error.code || 'FINAL_VERIFICATION_ERROR',
      error.type || 'server_error',
      error.extra || { details: error.message, model: '' }
    );
  }
};
