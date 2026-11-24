module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/external-mocks.ts'],
  roots: ['<rootDir>/test'],
  testRegex: '.e2e-spec.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: ['/node_modules/'],
  // @e2e tagged suites (e.g. rewards.e2e-spec.ts) run in the testnet CI job.
  // They are excluded from the default run unless E2E_TESTNET=true is set.
  testMatch: process.env.E2E_TESTNET === 'true'
    ? ['<rootDir>/test/**/*.e2e-spec.ts']
    : ['<rootDir>/test/**/*.e2e-spec.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
  testTimeout: process.env.E2E_TESTNET === 'true' ? 120000 : 30000,
};