const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const globalForPrisma = globalThis;

// Resiliencia ante cortes intermitentes del pooler Supabase: pasamos un
// pg.PoolConfig completo al adapter (acepta string | PoolConfig | Pool).
// Sin timeouts explícitos un request colgado puede esperar ~135s antes de
// fallar (visto en logs reales con login.findMany). Con estos valores la
// pool falla rápido y el handler devuelve 503 controlado en vez de tener
// al TPV congelado.
function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8_000,           // abrir socket TCP/TLS al pooler
    idleTimeoutMillis: 30_000,                // cerrar idle clients
    statement_timeout: 12_000,                // máx por query individual (ms)
    query_timeout: 12_000,                    // hard cap del cliente (ms)
    idle_in_transaction_session_timeout: 15_000,
    max: Number(process.env.DB_POOL_MAX || 10),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma, PrismaClient };
