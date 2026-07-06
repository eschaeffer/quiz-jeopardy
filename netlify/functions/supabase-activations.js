const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

function getSupabaseAdminClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase activation storage is not configured');
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function normalizeActivationRow(row) {
  if (!row) return null;
  return {
    license_key: row.license_key,
    instance_id: String(row.instance_id || ''),
    instance_name: row.instance_name || 'Unknown Device',
    status: row.status || 'active',
    activated_at: row.activated_at || null,
    deactivated_at: row.deactivated_at || null,
    last_seen_at: row.last_seen_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function upsertActivationRecord({ licenseKey, instanceId, instanceName, status = 'active' }) {
  const supabase = getSupabaseAdminClient();
  const timestamp = new Date().toISOString();
  const payload = {
    license_key: licenseKey,
    instance_id: String(instanceId),
    instance_name: instanceName || 'Unknown Device',
    status,
    last_seen_at: timestamp,
    updated_at: timestamp,
  };

  if (status === 'active') {
    payload.activated_at = timestamp;
    payload.deactivated_at = null;
  }

  const { data, error } = await supabase
    .from('license_activations')
    .upsert(payload, { onConflict: 'license_key,instance_id' })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeActivationRow(data);
}

async function touchActivationRecord({ licenseKey, instanceId }) {
  const supabase = getSupabaseAdminClient();
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('license_activations')
    .update({
      last_seen_at: timestamp,
      updated_at: timestamp,
    })
    .eq('license_key', licenseKey)
    .eq('instance_id', String(instanceId))
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return normalizeActivationRow(data);
}

async function deactivateActivationRecord({ licenseKey, instanceId }) {
  const supabase = getSupabaseAdminClient();
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('license_activations')
    .update({
      status: 'deactivated',
      deactivated_at: timestamp,
      updated_at: timestamp,
    })
    .eq('license_key', licenseKey)
    .eq('instance_id', String(instanceId))
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return normalizeActivationRow(data);
}

async function listActivationsForLicense(licenseKey) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('license_activations')
    .select('*')
    .eq('license_key', licenseKey)
    .order('status', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeActivationRow);
}

module.exports = {
  upsertActivationRecord,
  touchActivationRecord,
  deactivateActivationRecord,
  listActivationsForLicense,
};
