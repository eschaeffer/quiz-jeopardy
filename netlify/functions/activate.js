const { initializeCredits } = require('./supabase-credits');
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
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const { license_key, instance_name } = JSON.parse(event.body);

  if (!license_key || !instance_name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'license_key and instance_name are required' }),
    };
  }

  const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key, instance_name }),
  });

  const data = await response.json();

  if (response.ok && data?.activated && !isDevLicenseKey(license_key)) {
    try {
      const validated = await validateLicenseKeyServer(license_key);
      const productId = Number(validated.productId);
      if (validated.valid && productId) {
        data.credit_balance = await initializeCredits(license_key, productId);
      }
    } catch (error) {
      data.credit_balance_error = error.message;
    }
  }

  return {
    statusCode: response.status,
    body: JSON.stringify(data),
  };
};
