const { randomUUID } = require('crypto');
const { initializeCredits } = require('./supabase-credits');
const { validateLicenseKeyServer, isDevLicenseKey, getLocalTestLicenseProfile } = require('./license-server-utils');
const { upsertActivationRecord, listActivationsForLicense } = require('./supabase-activations');

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

  const localTestProfile = getLocalTestLicenseProfile(license_key, event);

  let responseStatus;
  let responseOk;
  let data;

  if (localTestProfile) {
    const activations = await listActivationsForLicense(license_key);
    const activeCount = activations.filter((activation) => activation.status === 'active').length;

    if (activeCount >= localTestProfile.activationLimit) {
      responseStatus = 400;
      responseOk = false;
      data = {
        activated: false,
        error: 'This license key has reached the activation limit. Deactivate an old device to continue.',
        meta: {
          product_id: localTestProfile.productId,
          variant_id: localTestProfile.variantId,
          license_key: {
            activation_limit: localTestProfile.activationLimit,
            activation_usage: activeCount,
          },
        },
      };
    } else {
      responseStatus = 200;
      responseOk = true;
      data = {
        activated: true,
        instance: {
          id: randomUUID(),
          name: instance_name,
        },
        meta: {
          product_id: localTestProfile.productId,
          variant_id: localTestProfile.variantId,
          license_key: {
            activation_limit: localTestProfile.activationLimit,
            activation_usage: activeCount + 1,
          },
        },
      };
    }
  } else {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key, instance_name }),
    });

    responseStatus = response.status;
    responseOk = response.ok;
    data = await response.json();
  }

  if (responseOk && data?.activated && !isDevLicenseKey(license_key)) {
    try {
      const validated = await validateLicenseKeyServer(license_key, event);
      const productId = Number(validated.productId);
      if (validated.valid && productId) {
        data.credit_balance = await initializeCredits(license_key, productId);
      }
    } catch (error) {
      data.credit_balance_error = error.message;
    }

    if (data.instance?.id) {
      try {
        data.activation_record = await upsertActivationRecord({
          licenseKey: license_key,
          instanceId: data.instance.id,
          instanceName: instance_name,
          status: 'active',
        });
      } catch (error) {
        data.activation_record_error = error.message;
      }
    }
  }

  return {
    statusCode: responseStatus,
    body: JSON.stringify(data),
  };
};
