#!/usr/bin/env node
// health-check.js — verifica todos los endpoints del monorepo mrtpvrest

const checks = [
  // Landing
  { name: "Landing (mrtpvrest.com)",   url: "https://mrtpvrest.com" },
  { name: "Landing (www)",             url: "https://www.mrtpvrest.com" },

  // Admin
  { name: "Admin Login",               url: "https://admin.mrtpvrest.com/login" },
  { name: "Admin Register",            url: "https://admin.mrtpvrest.com/register" },

  // SaaS
  { name: "SaaS Login",                url: "https://saas.mrtpvrest.com/login" },
  { name: "SaaS Dashboard",            url: "https://saas.mrtpvrest.com/dashboard" },

  // TPV
  { name: "TPV Root",                  url: "https://tpv.mrtpvrest.com" },

  // Client store
  { name: "Tienda Master Burgers",     url: "https://masterburguers.mrtpvrest.com" },

  // Backend API
  { name: "API Health",                url: "https://master-burguers-production.up.railway.app/health" },
  { name: "API Plans",                 url: "https://master-burguers-production.up.railway.app/api/saas/plans" },
];

const TIMEOUT_MS = 10_000;

function icon(status) {
  if (!status)          return "❌";
  if (status === 200)   return "✅";
  if (status === 301 || status === 302 || status === 307 || status === 308) return "⚠️";
  if (status < 400)     return "✅";
  return "❌";
}

async function checkOne({ name, url }) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      redirect: "manual",   // captura 3xx sin seguirlos
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    return { name, url, status: res.status, ms, error: null };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err.name === "AbortError" ? `timeout (>${TIMEOUT_MS}ms)` : err.message;
    return { name, url, status: null, ms, error: msg };
  }
}

function pad(str, len) {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  mrtpvrest — health check  " + new Date().toISOString());
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const results = await Promise.all(checks.map(checkOne));

  let passed = 0, warned = 0, failed = 0;

  for (const r of results) {
    const ic   = icon(r.status);
    const stat = r.status ? String(r.status) : "ERR";
    const time = `${r.ms}ms`;
    const line = `${ic}  ${pad(r.name, 28)}  ${pad(stat, 5)}  ${pad(time, 8)}`;

    if (!r.status || r.status >= 400) {
      failed++;
      console.log(line + (r.error ? `  — ${r.error}` : ""));
    } else if (r.status >= 300) {
      warned++;
      console.log(line + "  (redirect)");
    } else {
      passed++;
      console.log(line);
    }
  }

  const total = results.length;
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Resumen: ${passed} ✅  ${warned} ⚠️  ${failed} ❌   (${passed + warned} / ${total} responden)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (failed > 0) process.exit(1);
}

main();
