const { deactivateActivationRecord } = require('./supabase-activations');
const { getLocalTestLicenseProfile } = require('./license-server-utils');

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
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const { license_key, instance_id } = JSON.parse(event.body);

  if (!license_key || !instance_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'license_key and instance_id are required' }),
    };
  }

  const localTestProfile = getLocalTestLicenseProfile(license_key, event);

  let responseStatus;
  let data;

  if (localTestProfile) {
    responseStatus = 200;
    data = {
      deactivated: true,
      meta: {
        product_id: localTestProfile.productId,
        variant_id: localTestProfile.variantId,
      },
    };
  } else {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key, instance_id }),
    });

    responseStatus = response.status;
    data = await response.json();
  }

  if (data?.deactivated) {
    try {
      data.activation_record = await deactivateActivationRecord({
        licenseKey: license_key,
        instanceId: instance_id,
      });
    } catch (error) {
      data.activation_record_error = error.message;
    }
  }

  return {
    statusCode: responseStatus,
    body: JSON.stringify(data),
  };
};
