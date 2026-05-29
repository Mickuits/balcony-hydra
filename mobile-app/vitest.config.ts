// Vitest config — unit tests avec jsdom
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@tests': resolve(__dirname, 'tests')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['./tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/data/**',
        'src/types/**',
        'src/sw.ts',
        'src/main.ts',
        '**/*.test.ts',
        '**/*.template.ts'  // templates fns testées via les screen tests
      ],
      thresholds: {
        // Cliquet P1 (2026-05-29) : verrouille le niveau atteint
        // (mesuré ~96 % lignes/stmts, 95 % funcs, 86 % branches) avec marge.
        lines: 90,
        functions: 90,
        branches: 82,
        statements: 90
      }
    }
  }
});
