// Re-exports shared PrismaClient from @mrtpvrest/database
// All imports from this file (routes, services, middleware) remain unchanged
const { prisma } = require('@mrtpvrest/database');
module.exports = prisma;
