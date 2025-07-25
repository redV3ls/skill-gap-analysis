module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        types: ['@cloudflare/workers-types', 'jest', 'node'],
        skipLibCheck: true,
        noImplicitAny: false,
        strict: false
      }
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 10000,
  globals: {
    'ts-jest': {
      isolatedModules: true,
      diagnostics: {
        ignoreCodes: [2345, 2769, 2339, 2554, 2551, 2783, 2307, 2304, 2559, 2353, 2322, 2802]
      }
    }
  }
};