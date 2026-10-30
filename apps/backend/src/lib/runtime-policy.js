// Pure startup policy: safe to test without importing Express, Prisma or jobs.
function booleanSetting(value, name, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function resolveRuntimePolicy(env = process.env) {
  const isolated = booleanSetting(env.MARKETPLACE_ISOLATED, 'MARKETPLACE_ISOLATED', false);
  const requestedJobs = booleanSetting(env.ENABLE_BACKGROUND_JOBS, 'ENABLE_BACKGROUND_JOBS', !isolated);
  if (isolated && requestedJobs) {
    throw new Error('Background jobs cannot run in MARKETPLACE_ISOLATED mode');
  }
  const allowedOrigins = new Set();
  if (isolated) {
    for (const value of (env.MARKETPLACE_ALLOWED_ORIGINS || 'http://127.0.0.1:4103').split(',')) {
      const origin = value.trim();
      let url;
      try { url = new URL(origin); } catch { throw new Error('Invalid marketplace origin'); }
      if (!['http:', 'https:'].includes(url.protocol)
          || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
          || url.origin !== origin) {
        throw new Error('Marketplace origins must be exact loopback HTTP(S) origins');
      }
      allowedOrigins.add(origin);
    }
  }
  return {
    isolated,
    host: isolated ? '127.0.0.1' : (env.HOST || '0.0.0.0'),
    jobsEnabled: requestedJobs,
    socketsEnabled: !isolated,
    allowedOrigins,
    allowVercelPreviews: env.ALLOW_VERCEL_PREVIEWS === 'true',
  };
}

function createCorsOriginCheck(policy) {
  return (origin, callback) => {
    // CORS is a browser policy, not authentication; keep CLI/health clients working.
    if (!origin) return callback(null, true);
    let allowed = false;
    if (policy.isolated) {
      allowed = policy.allowedOrigins.has(origin);
    } else {
      let host = '';
      try { host = new URL(origin).hostname; } catch { /* reject below */ }
      allowed = host === 'mrtpvrest.com' || host.endsWith('.mrtpvrest.com')
        || (policy.allowVercelPreviews && host.endsWith('.vercel.app'))
        || host === 'localhost' || host === '127.0.0.1' || origin.startsWith('capacitor://')
        || origin.startsWith('tauri://') || host === 'tauri.localhost';
    }
    if (allowed) return callback(null, true);
    const error = new Error('CORS not allowed for ' + origin);
    error.statusCode = 403;
    error.code = 'CORS_BLOCKED';
    error.level = 'WARN';
    error.isOperational = true;
    return callback(error);
  };
}

function createSocketAdmission(policy) {
  // When the DB sweep is disabled, reject ALL new socket transports instead of
  // leaving authenticated connections without periodic principal revalidation.
  return (_request, callback) => callback(null, policy.socketsEnabled);
}

function startBackgroundTasks(policy, io, { startRevalidationSweep, loadJob = require }) {
  // Business-job switches must never disable socket authorization revalidation.
  if (policy.socketsEnabled) startRevalidationSweep(io);
  if (!policy.jobsEnabled) return;
  loadJob('../jobs/trialExpiry.job').startTrialExpiryJob();
  loadJob('../jobs/autoPromos.job').startAutoPromosJob();
  loadJob('../jobs/unverifiedPurge.job').startUnverifiedPurgeJob();
  loadJob('../jobs/recurringPayables.job').startRecurringPayablesJob();
  loadJob('../jobs/whatsappBotReport.job').startWhatsappBotReportJob();
  loadJob('../jobs/demoExpiry.job').startDemoExpiryJob();
  loadJob('../jobs/staleTableOrders.job').startStaleTableOrdersJob(io);
}

module.exports = { resolveRuntimePolicy, createCorsOriginCheck, createSocketAdmission, startBackgroundTasks };
