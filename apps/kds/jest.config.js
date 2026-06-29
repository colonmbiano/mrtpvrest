// Scaffolding de tests del KDS. Para HABILITARLO (correrlo en CI/local) falta
// instalar las deps en este paquete, lo que actualiza pnpm-lock.yaml:
//   pnpm add -D jest @types/jest jest-environment-jsdom --filter @mrtpvrest/kds
// y agregar el script "test": "jest --passWithNoTests". Se dejaron fuera del
// package.json para no romper `pnpm install --frozen-lockfile` del E2E sin tocar
// el lockfile. La lógica de production-summary ya está verificada (tsc + node).
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
