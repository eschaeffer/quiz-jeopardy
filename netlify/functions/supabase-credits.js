const { createClient } = require('@supabase/supabase-js');
const { getCreditTierByProductId } = require('./credit-config');

let cachedClient = null;

function getSupabaseAdminClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase credit storage is not configured');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function normalizeBalanceRow(row) {
  if (!row) return null;
  return {
    license_key: row.license_key,
    product_id: Number(row.product_id) || 0,
    tier_name: row.tier_name,
    credits_total: Number(row.credits_total) || 0,
    credits_remaining: Number(row.credits_remaining) || 0,
    credits_used: Number(row.credits_used) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function getCreditBalance(licenseKey) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('license_credits')
    .select('*')
    .eq('license_key', licenseKey)
    .maybeSingle();

  if (error) throw error;
  return normalizeBalanceRow(data);
}

async function initializeCredits(licenseKey, productId) {
  const existing = await getCreditBalance(licenseKey);
  if (existing) return existing;

  const tier = getCreditTierByProductId(productId);
  if (!tier || tier.isRefill) {
    throw new Error(`No base credit tier configured for product ${productId}`);
  }

  const supabase = getSupabaseAdminClient();
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('license_credits')
    .insert({
      license_key: licenseKey,
      product_id: Number(productId),
      tier_name: tier.tierName,
      credits_total: tier.credits,
      credits_remaining: tier.credits,
      credits_used: 0,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return getCreditBalance(licenseKey);
    }
    throw error;
  }

  return normalizeBalanceRow(data);
}

async function decrementCredit(licenseKey) {
  const supabase = getSupabaseAdminClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await getCreditBalance(licenseKey);
    if (!current) {
      throw new Error('No credit balance found for this license key');
    }
    if (current.credits_remaining <= 0) {
      throw new Error('No quiz generations remaining');
    }

    const nextRemaining = current.credits_remaining - 1;
    const nextUsed = current.credits_used + 1;
    const { data, error } = await supabase
      .from('license_credits')
      .update({
        credits_remaining: nextRemaining,
        credits_used: nextUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('license_key', licenseKey)
      .eq('credits_remaining', current.credits_remaining)
      .eq('credits_used', current.credits_used)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (data) return normalizeBalanceRow(data);
  }

  throw new Error('Could not safely decrement credits after multiple attempts');
}

async function addCredits(licenseKey, additionalCredits) {
  const supabase = getSupabaseAdminClient();
  const current = await getCreditBalance(licenseKey);
  if (!current) {
    throw new Error('No credit balance found for this license key');
  }

  const incrementBy = Number(additionalCredits) || 0;
  if (incrementBy <= 0) {
    throw new Error('additionalCredits must be greater than zero');
  }

  const { data, error } = await supabase
    .from('license_credits')
    .update({
      credits_total: current.credits_total + incrementBy,
      credits_remaining: current.credits_remaining + incrementBy,
      updated_at: new Date().toISOString(),
    })
    .eq('license_key', licenseKey)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeBalanceRow(data);
}

async function isRefillConsumed(refillKey) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('consumed_refills')
    .select('refill_key')
    .eq('refill_key', refillKey)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function consumeRefillKey(refillKey) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('consumed_refills')
    .insert({ refill_key: refillKey });

  if (error) throw error;
}

module.exports = {
  getCreditBalance,
  initializeCredits,
  decrementCredit,
  addCredits,
  isRefillConsumed,
  consumeRefillKey,
};
