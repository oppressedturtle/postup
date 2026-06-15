import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environmentMatchGlobs: [
      ['src/components/**/*.test.*', 'jsdom'],
      ['src/components/**/__tests__/**', 'jsdom'],
    ],
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 70, functions: 70, branches: 60 },
      include: ['src/lib/**', 'src/app/api/**', 'src/components/**'],
      exclude: [
        'src/lib/db.ts',
        'src/lib/env.ts',
        'src/generated/**',
        'src/components/**/*.test.*',
        'src/components/**/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
