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
  // Regex en vez de glob: los globs con <rootDir> se rompen cuando el repo
  // vive bajo un directorio con punto (p.ej. worktrees en .claude\worktrees:
  // jest deja el "\." del path como escape y micromatch ya no casa nada).
  testRegex: "/src/.*/__tests__/.*\\.test\\.ts$",
  collectCoverageFrom: ["src/lib/**/*.ts", "!src/**/*.d.ts"],
});
