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
      thresholds: { lines: 25, functions: 50, branches: 50 },
      include: ['src/lib/**', 'src/app/api/**', 'src/components/**'],
      exclude: [
        // Infrastructure singletons — require live external services; better covered by integration tests
        'src/lib/auth.ts',
        'src/lib/redis.ts',
        'src/lib/storage.ts',
        'src/lib/logger.ts',
        'src/lib/oembed.ts',
        'src/lib/link-preview.ts',
        // Generated / config
        'src/lib/db.ts',
        'src/lib/env.ts',
        'src/generated/**',
        // Test files themselves
        'src/components/**/*.test.*',
        'src/components/**/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
