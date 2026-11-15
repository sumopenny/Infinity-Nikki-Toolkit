import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import { expect, it } from 'vitest'

function styles(directory: string): Array<{ file: string; css: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) return styles(file)
    if (!/\.(css|vue)$/.test(file)) return []
    const text = readFileSync(file, 'utf8')
    return file.endsWith('.css')
      ? [{ file, css: text }]
      : [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
          file,
          css: match[1]!
        }))
  })
}

it('covers mixed values with a preceding plain declaration or a negative feature query', () => {
  const normalize = (selector: string) => selector.replace(/\s+/g, '')
  for (const { file, css } of styles('src')) {
    const root = postcss.parse(css)
    const fallbackRules = new Map<string, Set<string>>()
    root.walkAtRules('supports', (query) => {
      if (query.params !== 'not (color: color-mix(in srgb, black, white))') return
      query.walkRules((rule) => {
        const key = normalize(rule.selector)
        const properties = fallbackRules.get(key) ?? new Set<string>()
        rule.walkDecls((declaration) => {
          expect(declaration.value, file).not.toContain('color-mix(')
          properties.add(declaration.prop)
        })
        fallbackRules.set(key, properties)
      })
    })
    root.walkDecls((declaration) => {
      if (!declaration.value.includes('color-mix(')) return
      const rule = declaration.parent
      if (rule?.type !== 'rule') throw new Error(`${file}: unexpected mixed declaration`)
      // Unsupported color-mix declarations can also fall back to an earlier
      // plain declaration of the same property in the same selector.
      const previousPlain = rule.nodes
        .slice(0, rule.nodes.indexOf(declaration))
        .some(
          (node) =>
            node.type === 'decl' &&
            node.prop === declaration.prop &&
            !node.value.includes('color-mix(')
        )
      expect(
        previousPlain || fallbackRules.get(normalize(rule.selector))?.has(declaration.prop),
        `${file}: ${rule.selector} / ${declaration.prop}`
      ).toBe(true)
    })
  }
})

it('preserves the spinner top accent when replacing its border shorthand', () => {
  const root = postcss.parse(readFileSync('src/styles/dialogs.css', 'utf8'))
  let checked = 0
  root.walkAtRules('supports', (query) => {
    query.walkRules((rule) => {
      if (!rule.selector.endsWith('.operation-notice-spinner')) return
      const properties = rule.nodes.filter((node) => node.type === 'decl')
      expect(properties.slice(0, 2).map((node) => node.prop)).toEqual([
        'border',
        'border-top-color'
      ])
      expect(properties[1]?.value).toBe('var(--notice-accent)')
      checked++
    })
  })
  expect(checked).toBe(2)
})
