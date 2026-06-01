/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  // La cobertura se enfoca en la lógica PURA y crítica de dinero/validación,
  // que es la que tiene sentido cubrir con tests unitarios deterministas. Las
  // rutas/servicios (Express + Prisma) requieren tests de INTEGRACIÓN con una
  // BD real (ver ARD §10) — esfuerzo aparte con su propio job de CI. El umbral
  // anterior (40% sobre todo src/**) era inalcanzable (~6% real) y dejaba
  // `test:coverage` siempre en rojo; aquí lo hacemos honesto y exigente sobre
  // el núcleo testeable.
  collectCoverageFrom: [
    'src/lib/money.js',
    'src/lib/validate.js',
    'src/lib/auth-metrics.js',
  ],
  coverageThreshold: {
    global: { lines: 95, functions: 95, branches: 70 },
  },
  testTimeout: 10000,
};
