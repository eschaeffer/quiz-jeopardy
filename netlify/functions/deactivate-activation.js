const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { deactivateActivationRecord } = require('./supabase-activations');
const { isDevLicenseKey, getLocalTestLicenseProfile } = require('./license-server-utils');

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
      return errorResponse(400, 'Dev key does not use remote deactivation', 'DEACTIVATE_NOT_SUPPORTED', 'request_error');
    }

    const localTestProfile = getLocalTestLicenseProfile(license_key, event);

    if (!localTestProfile) {
      const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key, instance_id }),
      });
      const data = await response.json();

      if (!response.ok || !data?.deactivated) {
        return {
          statusCode: response.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        };
      }
    }

    const activation_record = await deactivateActivationRecord({
      licenseKey: license_key,
      instanceId: instance_id,
    });

    return jsonResponse(200, {
      deactivated: true,
      activation_record,
    });
  } catch (error) {
    return errorResponse(500, error.message || 'Could not deactivate activation', 'DEACTIVATE_ACTIVATION_ERROR', 'server_error');
  }
};
