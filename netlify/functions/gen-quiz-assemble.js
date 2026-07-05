const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { parseJsonBody, createHandledError, buildQuizFromStageResults, decrementCreditAfterSuccess, attachCreditBalanceToQuiz } = require('./quiz-orchestration');

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
    if (!payload?.setup || !Array.isArray(payload?.round1) || !Array.isArray(payload?.round2) || !payload?.finalData || !Array.isArray(payload?.round1Verification) || !Array.isArray(payload?.round2Verification) || !payload?.finalVerification) {
      throw createHandledError(400, 'setup, round1, round2, finalData, round1Verification, round2Verification, and finalVerification are required', 'BAD_REQUEST', 'request_error');
    }

    const quiz = buildQuizFromStageResults({
      setup: payload.setup,
      round1: payload.round1,
      round2: payload.round2,
      finalData: payload.finalData,
      round1Verification: payload.round1Verification,
      round2Verification: payload.round2Verification,
      finalVerification: payload.finalVerification,
    });

    let updatedBalance = payload.setup.credit_balance || null;
    try {
      updatedBalance = await decrementCreditAfterSuccess(payload.setup.license_key);
    } catch (decrementError) {
      console.warn('Credit decrement failed after successful staged generation', decrementError);
    }

    return jsonResponse(200, attachCreditBalanceToQuiz(quiz, updatedBalance));
  } catch (error) {
    return errorResponse(
      error.statusCode || 500,
      error.message,
      error.code || 'ASSEMBLY_ERROR',
      error.type || 'server_error',
      error.extra || { details: error.message, model: '' }
    );
  }
};
