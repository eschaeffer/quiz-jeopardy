const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { touchActivationRecord } = require('./supabase-activations');
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
    const { license_key, instance_id } = JSON.parse(event.body || '{}');
    if (!license_key || !instance_id) {
      return errorResponse(400, 'license_key and instance_id are required', 'BAD_REQUEST', 'request_error');
    }
    if (isDevLicenseKey(license_key)) {
      return jsonResponse(200, { touched: false });
    }

    return jsonResponse(200, {
      touched: true,
      activation_record: await touchActivationRecord({
        licenseKey: license_key,
        instanceId: instance_id,
      }),
    });
  } catch (error) {
    return errorResponse(500, error.message || 'Could not update activation', 'TOUCH_ACTIVATION_ERROR', 'server_error');
  }
};
