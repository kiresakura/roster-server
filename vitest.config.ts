import { defineConfig } from 'vitest/config';

// Unit tests target the pure domain layer (src/domain/**) plus services built
// by hand over in-memory fakes — no NestJS DI, no decorator metadata — so the
// default esbuild transform is sufficient.
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
  },
});
