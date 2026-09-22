import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve NodeNext's runtime .js specifiers to their TypeScript sources in tests.
  resolve: { alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }] },
  // CDK synthesis/bundling is CPU-heavy; bound overlap so normal five-second assertions do not starve.
  test: { environment: 'node', include: ['test/**/*.test.ts'], maxWorkers: 4 },
});
