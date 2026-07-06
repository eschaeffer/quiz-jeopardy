const { DEV_KEY, LOCAL_TEST_STANDARD_KEY } = require('./credit-config');

const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

const LOCAL_TEST_LICENSES = {
  [LOCAL_TEST_STANDARD_KEY]: {
    productId: 1166895,
    variantId: 1166895,
    activationLimit: 3,
    label: 'local_test_standard',
  },
};

function isLocalLicenseTestingAllowed(event = null) {
  const context = String(process.env.CONTEXT || '').toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const host = String(event?.headers?.host || event?.headers?.Host || '').toLowerCase();
  return context === 'dev' || nodeEnv === 'development' || host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
}

function getLocalTestLicenseProfile(licenseKey, event = null) {
  if (!isLocalLicenseTestingAllowed(event)) return null;
  const normalizedKey = String(licenseKey || '').trim().toUpperCase();
  return LOCAL_TEST_LICENSES[normalizedKey] || null;
}

async function validateLicenseKeyServer(licenseKey, event = null) {
  const localTestProfile = getLocalTestLicenseProfile(licenseKey, event);
  if (localTestProfile) {
    return {
      ok: true,
      response: null,
      data: {
        valid: true,
        meta: {
          product_id: localTestProfile.productId,
          variant_id: localTestProfile.variantId,
          activation_limit: localTestProfile.activationLimit,
          source: localTestProfile.label,
        },
      },
      valid: true,
      productId: localTestProfile.productId,
      variantId: localTestProfile.variantId,
    };
  }

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
    variantId: Number(data?.meta?.variant_id) || null,
  };
}

function isDevLicenseKey(licenseKey) {
  return String(licenseKey || '').trim() === DEV_KEY;
}

module.exports = {
  DEV_KEY,
  LOCAL_TEST_STANDARD_KEY,
  LS_VALIDATE_URL,
  getLocalTestLicenseProfile,
  isLocalLicenseTestingAllowed,
  validateLicenseKeyServer,
  isDevLicenseKey,
};
