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

  return {
    statusCode: response.status,
    body: JSON.stringify(data),
  };
};
