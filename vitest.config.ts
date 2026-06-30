import { defineConfig } from 'vitest/config';

// Unit tests target the pure domain layer (src/domain/**) — no NestJS DI,
// no decorator metadata — so the default esbuild transform is sufficient.
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
  },
});
