import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 70, functions: 70, branches: 60 },
      include: ['src/lib/**', 'src/app/api/**'],
      exclude: ['src/lib/db.ts', 'src/lib/env.ts', 'src/generated/**'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
