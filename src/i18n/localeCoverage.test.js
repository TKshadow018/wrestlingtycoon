import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'espree'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
const locale = JSON.parse(readFileSync(new URL('./locales/en.json', import.meta.url), 'utf8'))
const localeKeys = new Set()

const collectLocaleKeys = (value, prefix = '') => {
  if (Array.isArray(value)) {
    localeKeys.add(prefix)
    value.forEach((entry, index) => collectLocaleKeys(entry, `${prefix}.${index}`))
    return
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key
      collectLocaleKeys(entry, fullKey)
    })
    return
  }

  localeKeys.add(prefix)
}

const collectSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) {
    return collectSourceFiles(path)
  }
  return /\.(js|jsx)$/.test(entry.name) && !/\.(test|spec)\.(js|jsx)$/.test(entry.name)
    ? [path]
    : []
})

const collectMissingTranslationKeys = () => {
  const missing = []

  collectSourceFiles(sourceRoot).forEach((path) => {
    const source = readFileSync(path, 'utf8')
    const ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
    })

    const visit = (node) => {
      if (!node || typeof node !== 'object') return

      const isTranslationCall = node.type === 'CallExpression'
        && (
          (node.callee.type === 'Identifier' && node.callee.name === 't')
          || (node.callee.type === 'MemberExpression' && node.callee.property?.name === 't')
        )
      const key = isTranslationCall && node.arguments[0]?.type === 'Literal'
        ? node.arguments[0].value
        : null

      if (typeof key === 'string' && !localeKeys.has(key)) {
        missing.push(`${relative(sourceRoot, path)}:${node.loc.start.line} ${key}`)
      }

      Object.entries(node).forEach(([keyName, child]) => {
        if (['parent', 'tokens', 'comments'].includes(keyName)) return
        if (Array.isArray(child)) child.forEach(visit)
        else if (child && typeof child === 'object') visit(child)
      })
    }

    visit(ast)
  })

  return missing
}

const UI_TEXT_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'placeholder',
  'title',
])

const collectHardcodedUiText = () => {
  const hardcoded = []
  const addText = (path, location, text, context) => {
    const visibleWords = typeof text === 'string'
      ? text.replace(/\{\{[^}]*\}\}/g, '').trim()
      : ''
    if (/[A-Za-z]{3,}/.test(visibleWords)) {
      hardcoded.push(`${relative(sourceRoot, path)}:${location.start.line} ${context} ${JSON.stringify(visibleWords)}`)
    }
  }

  collectSourceFiles(sourceRoot).forEach((path) => {
    const ast = parse(readFileSync(path, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      loc: true,
    })

    const visit = (node) => {
      if (!node || typeof node !== 'object') return

      if (node.type === 'JSXText') {
        addText(path, node.loc, node.value, 'JSX text')
      }

      if (node.type === 'JSXAttribute' && UI_TEXT_ATTRIBUTES.has(node.name?.name)) {
        const value = node.value?.type === 'Literal'
          ? node.value.value
          : node.value?.type === 'JSXExpressionContainer'
            ? node.value.expression
            : null

        if (typeof value === 'string') {
          addText(path, node.loc, value, `${node.name.name} attribute`)
        } else if (value?.type === 'TemplateLiteral') {
          addText(path, node.loc, value.quasis.map((part) => part.value.cooked).join('{{value}}'), `${node.name.name} attribute`)
        } else if (value?.type === 'Literal') {
          addText(path, node.loc, value.value, `${node.name.name} attribute`)
        }
      }

      if (node.type === 'CallExpression'
        && (
          (node.callee.type === 'Identifier' && node.callee.name === 't')
          || (node.callee.type === 'MemberExpression' && node.callee.property?.name === 't')
        )) {
        const fallback = node.arguments[1]
        if (fallback?.type === 'Literal') {
          addText(path, fallback.loc, fallback.value, 'translation fallback')
        } else if (fallback?.type === 'ObjectExpression') {
          const defaultValue = fallback.properties.find((property) => (
            (property.key?.name || property.key?.value) === 'defaultValue'
          ))?.value
          if (defaultValue?.type === 'Literal') {
            addText(path, defaultValue.loc, defaultValue.value, 'translation fallback')
          }
        }
        const trailingFallback = node.arguments[2]
        if (trailingFallback?.type === 'Literal') {
          addText(path, trailingFallback.loc, trailingFallback.value, 'translation fallback')
        }
      }

      if (node.type === 'Property' && node.key?.name === 'label' && node.value?.type === 'Literal') {
        addText(path, node.loc, node.value.value, 'label property')
      }

      if (node.type === 'Property'
        && node.key?.name === 'headline'
        && ['Literal', 'TemplateLiteral'].includes(node.value?.type)) {
        const headline = node.value.type === 'TemplateLiteral'
          ? node.value.quasis.map((part) => part.value.cooked).join('{{value}}')
          : node.value.value
        addText(path, node.value.loc, headline, 'headline property')
      }

      if (node.type === 'VariableDeclarator'
        && node.id?.type === 'Identifier'
        && /LABELS$/.test(node.id.name)
        && node.init?.type === 'ObjectExpression') {
        node.init.properties.forEach((property) => {
          if (property.type === 'Property' && property.value?.type === 'Literal') {
            addText(path, property.value.loc, property.value.value, 'label map value')
          }
        })
      }

      if (node.type === 'Property'
        && ['actionKey', 'descriptionKey', 'headlineKey', 'labelKey', 'messageKey', 'nameKey', 'titleKey'].includes(node.key?.name)
        && node.value?.type === 'Literal'
        && typeof node.value.value === 'string'
        && node.value.value.startsWith('dashboard.')
        && !localeKeys.has(node.value.value)) {
        hardcoded.push(`${relative(sourceRoot, path)}:${node.loc.start.line} missing locale key ${node.value.value}`)
      }

      Object.entries(node).forEach(([keyName, child]) => {
        if (['parent', 'tokens', 'comments'].includes(keyName)) return
        if (Array.isArray(child)) child.forEach(visit)
        else if (child && typeof child === 'object') visit(child)
      })
    }

    visit(ast)
  })

  return hardcoded
}

collectLocaleKeys(locale)

describe('locale resource coverage', () => {
  it('defines every statically referenced translation key in English', () => {
    expect(collectMissingTranslationKeys()).toEqual([])
  }, 20_000)

  it('keeps visible JSX text, accessible labels, and UI label properties in locale resources', () => {
    expect(collectHardcodedUiText()).toEqual([])
  }, 20_000)
})
