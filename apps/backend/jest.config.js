/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/index.js'],
  coverageThreshold: { global: { lines: 40 } },
  testTimeout: 10000,
};
