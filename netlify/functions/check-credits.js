const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { getCreditBalance, initializeCredits } = require('./supabase-credits');
const { validateLicenseKeyServer, isDevLicenseKey } = require('./license-server-utils');

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
    const { license_key } = JSON.parse(event.body || '{}');
    if (!license_key) {
      return errorResponse(400, 'license_key is required', 'BAD_REQUEST', 'request_error');
    }

    if (isDevLicenseKey(license_key)) {
      return jsonResponse(200, {
        is_unlimited: true,
        tier_name: 'dev',
        credits_total: null,
        credits_remaining: null,
        credits_used: 0,
      });
    }

    let balance = await getCreditBalance(license_key);
    if (!balance) {
      const validated = await validateLicenseKeyServer(license_key);
      if (!validated.valid || !validated.productId) {
        return errorResponse(400, 'Could not initialize credits for this license key', 'INVALID_LICENSE', 'request_error');
      }
      balance = await initializeCredits(license_key, validated.productId);
    }

    return jsonResponse(200, balance);
  } catch (error) {
    return errorResponse(500, error.message || 'Could not check credits', 'CHECK_CREDITS_ERROR', 'server_error');
  }
};
