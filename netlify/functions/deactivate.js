const { deactivateActivationRecord } = require('./supabase-activations');

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

  const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key, instance_id }),
  });

  const data = await response.json();

  if (response.ok && data?.deactivated) {
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
    statusCode: response.status,
    body: JSON.stringify(data),
  };
};
