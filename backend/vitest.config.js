import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    testTimeout: 5000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['services/**/*.js', 'lib/**/*.js', 'prompts/**/*.js'],
      exclude: ['**/*.test.js', 'node_modules/**'],
    },
  },
});
