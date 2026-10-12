import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'eslint.config.js', 'vite.config.js'],
      exclude: ['**/*.test.js', '**/*.spec.js'],
      thresholds: {
        perFile: true,
        statements: 80,
        lines: 80,
        functions: 80,
      },
    },
  },
})
