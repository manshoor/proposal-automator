import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 5000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['services/**/*.{js,ts}', 'lib/**/*.{js,ts}', 'prompts/**/*.{js,ts}'],
      exclude: ['**/*.test.{js,ts}', 'node_modules/**'],
    },
  },
  // The codebase uses .js extensions in imports (the standard ESM pattern). When
  // a file is converted to .ts, those .js imports must still resolve. Vite's
  // resolver picks the matching .ts file when the .js doesn't exist on disk.
  resolve: {
    extensions: ['.js', '.ts', '.mjs', '.json'],
  },
});
