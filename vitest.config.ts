import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      // Miniflare configuration for Cloudflare Workers testing
      modules: true,
      scriptPath: './dist/index.js',
      bindings: {
        // Mock environment variables for testing
        JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
        ENVIRONMENT: 'test',
      },
      kvNamespaces: ['TEST_CACHE'],
      d1Databases: ['TEST_DB'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/migrations/**',
        '**/scripts/**',
        '**/__tests__/**',
        '**/test/**',
        '**/tests/**',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});