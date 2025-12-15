module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/config/',
    '/_misc/',
    '/_tmp/',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  testSequencer: '<rootDir>/__tests__/__setup__/test-sequencer.cjs',
  globalSetup: '<rootDir>/__tests__/__setup__/global-setup.cjs',
  globalTeardown: '<rootDir>/__tests__/__setup__/global-teardown.cjs',
};
