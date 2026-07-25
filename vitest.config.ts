import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The race-quality and difficulty guards run hundreds of full races each.
    // They are slow by nature — the alternative is measuring so few seeds that
    // the results are noise, which would make the suite flaky and useless.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
