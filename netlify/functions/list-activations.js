const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { listActivationsForLicense } = require('./supabase-activations');
const { isDevLicenseKey } = require('./license-server-utils');

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
      return jsonResponse(200, { activations: [] });
    }

    return jsonResponse(200, { activations: await listActivationsForLicense(license_key) });
  } catch (error) {
    return errorResponse(500, error.message || 'Could not load activations', 'LIST_ACTIVATIONS_ERROR', 'server_error');
  }
};
