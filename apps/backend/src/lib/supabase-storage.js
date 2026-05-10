// Cliente de Supabase Storage usado por el módulo OTA. Usa la service_role
// key (no la anon) porque el bucket de bundles puede ser privado y necesitamos
// firmar URLs de descarga con TTL.
const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas para OTA');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

const OTA_BUCKET = process.env.OTA_BUCKET || 'tpv-ota';

async function uploadBundle(storagePath, buffer, contentType = 'application/zip') {
  const sb = getSupabase();
  const { error } = await sb.storage
    .from(OTA_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return storagePath;
}

async function createSignedDownloadUrl(storagePath, expiresInSeconds = 3600) {
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(OTA_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw new Error(`Supabase signed URL failed: ${error.message}`);
  return data.signedUrl;
}

async function deleteBundle(storagePath) {
  const sb = getSupabase();
  const { error } = await sb.storage.from(OTA_BUCKET).remove([storagePath]);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

module.exports = { getSupabase, uploadBundle, createSignedDownloadUrl, deleteBundle, OTA_BUCKET };
