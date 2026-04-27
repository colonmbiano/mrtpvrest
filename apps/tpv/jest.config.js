/** @type {import('jest').Config} */
const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

module.exports = createJestConfig({
  displayName: "@mrtpvrest/tpv",
  testEnvironment: "jsdom",
  setupFilesAfterFramework: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/src/**/__tests__/**/*.test.tsx",
  ],
  collectCoverageFrom: [
    "src/store/**/*.ts",
    "src/hooks/**/*.ts",
    "src/lib/**/*.ts",
    "!src/**/*.d.ts",
  ],
});
