import { describe, expect, it } from 'vitest'
import viteConfig from './vite.config.js?coverage-test'

describe('Vite and coverage configuration', () => {
  it('loads the React plugin and enforces per-file JavaScript thresholds', () => {
    expect(viteConfig.plugins).toHaveLength(1)
    expect(viteConfig.test.coverage).toMatchObject({
      provider: 'v8',
      include: ['src/**/*.js', 'eslint.config.js', 'vite.config.js'],
      thresholds: {
        perFile: true,
        statements: 80,
        lines: 80,
        functions: 80,
      },
    })
    expect(viteConfig.test.coverage.exclude).toContain('**/*.test.js')
  })
})
