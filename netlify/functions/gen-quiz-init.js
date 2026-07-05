const { requestCategoryPlan } = require('./quiz-category-planner');
const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { parseJsonBody, resolveGenerationSetup } = require('./quiz-orchestration');

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
    return jsonResponse(200, await resolveGenerationSetup({ event, payload, requestCategoryPlan }));
  } catch (error) {
    return errorResponse(
      error.statusCode || 500,
      error.message,
      error.code || 'GEN_QUIZ_INIT_ERROR',
      error.type || 'server_error',
      error.extra || { details: error.message, model: '' }
    );
  }
};
