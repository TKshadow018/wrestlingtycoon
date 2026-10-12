import { describe, expect, it } from 'vitest'
import eslintConfig from './eslint.config'

describe('ESLint configuration', () => {
  it('applies the project rules to JavaScript and JSX and ignores build output', () => {
    expect(eslintConfig).toEqual(expect.arrayContaining([
      expect.objectContaining({ ignores: ['dist'] }),
    ]))
    const jsxConfig = eslintConfig.find((entry) => (
      entry.files?.includes('**/*.{js,jsx}')
      && entry.languageOptions?.parserOptions?.ecmaFeatures?.jsx
    ))
    expect(jsxConfig).toBeDefined()
    expect(jsxConfig.languageOptions.globals).toEqual(expect.any(Object))
    expect(eslintConfig.some((entry) => 'react-hooks' in (entry.plugins || {}))).toBe(true)
    expect(eslintConfig.some((entry) => 'react-refresh' in (entry.plugins || {}))).toBe(true)
  })
})
