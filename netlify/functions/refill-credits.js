const { jsonResponse, errorResponse } = require('./quiz-generation-utils');
const { addCredits, getCreditBalance, isRefillConsumed, consumeRefillKey } = require('./supabase-credits');
const { validateLicenseKeyServer, isDevLicenseKey } = require('./license-server-utils');
const { getCreditTierByProductId } = require('./credit-config');

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
    const { licenseKey, refillKey } = JSON.parse(event.body || '{}');
    if (!licenseKey || !refillKey) {
      return errorResponse(400, 'licenseKey and refillKey are required', 'BAD_REQUEST', 'request_error');
    }
    if (isDevLicenseKey(licenseKey)) {
      return errorResponse(400, 'Dev key does not use refill credits', 'REFILL_NOT_SUPPORTED', 'request_error');
    }

    const currentBalance = await getCreditBalance(licenseKey);
    if (!currentBalance) {
      return errorResponse(400, 'No credit balance exists for this license key yet', 'NO_CREDIT_ROW', 'request_error');
    }
    if (await isRefillConsumed(refillKey)) {
      return errorResponse(400, 'This refill key has already been used', 'REFILL_ALREADY_CONSUMED', 'request_error');
    }

    const validated = await validateLicenseKeyServer(refillKey);
    if (!validated.valid || !validated.productId) {
      return errorResponse(400, 'Invalid refill key', 'INVALID_REFILL_KEY', 'request_error');
    }

    const refillTier = getCreditTierByProductId(validated.productId);
    if (!refillTier || !refillTier.isRefill) {
      return errorResponse(400, 'This key is not configured as a refill product yet', 'REFILL_PRODUCT_NOT_CONFIGURED', 'request_error');
    }

    const updatedBalance = await addCredits(licenseKey, refillTier.credits);
    await consumeRefillKey(refillKey);

    return jsonResponse(200, {
      success: true,
      credits_remaining: updatedBalance.credits_remaining,
      credits_total: updatedBalance.credits_total,
      refill_amount: refillTier.credits,
      tier_name: updatedBalance.tier_name,
    });
  } catch (error) {
    return errorResponse(500, error.message || 'Could not apply refill credits', 'REFILL_CREDITS_ERROR', 'server_error');
  }
};
