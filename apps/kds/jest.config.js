/** @type {import('jest').Config} */
const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

module.exports = createJestConfig({
  displayName: "@mrtpvrest/kds",
  // Helpers puros (sin DOM): entorno node.
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/lib/**/*.ts", "!src/**/*.d.ts"],
});
