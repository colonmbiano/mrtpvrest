const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const nextJest = require(path.join(root, 'apps/tpv/node_modules/next/jest'));
module.exports = nextJest({ dir: path.join(root, 'apps/tpv') })({
  rootDir: root,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/apps/tpv/jest.setup.js'],
  testRegex: '/tests/boneless/.*\\.test\\.tsx$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/tpv/src/$1',
  },
});
