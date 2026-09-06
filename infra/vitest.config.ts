import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve NodeNext's runtime .js specifiers to their TypeScript sources in tests.
  resolve: { alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }] },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
