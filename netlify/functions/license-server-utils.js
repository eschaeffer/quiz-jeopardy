const { DEV_KEY } = require('./credit-config');

const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

async function validateLicenseKeyServer(licenseKey) {
  const response = await fetch(LS_VALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: licenseKey }),
  });

  const data = await response.json();
  return {
    ok: response.ok,
    response,
    data,
    valid: data?.valid === true,
    productId: Number(data?.meta?.product_id) || null,
  };
}

function isDevLicenseKey(licenseKey) {
  return String(licenseKey || '').trim() === DEV_KEY;
}

module.exports = {
  DEV_KEY,
  LS_VALIDATE_URL,
  validateLicenseKeyServer,
  isDevLicenseKey,
};
