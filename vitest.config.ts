// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Optional: Use if you want Jest-like globals
    environment: 'node', // Specify Node environment
    coverage: {
      provider: 'v8', // Specify coverage provider
      reporter: ['text', 'json', 'html'], // Coverage report formats
    },
  },
});
