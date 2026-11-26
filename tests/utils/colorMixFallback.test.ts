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

function assertFallbacks(file: string, css: string) {
  const normalize = (selector: string) => selector.replace(/\s+/g, '')

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
  const plainRules = new Map<string, Set<string>>()
  root.walkDecls((declaration) => {
    const parent = declaration.parent
    if (
      parent?.type === 'rule' &&
      parent.parent?.type === 'root' &&
      !declaration.value.includes('color-mix(')
    ) {
      for (const selector of parent.selectors) {
        const key = normalize(selector)
        const props = plainRules.get(key) ?? new Set<string>()
        props.add(declaration.prop)
        plainRules.set(key, props)
      }
    }
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
    const guard = rule.parent
    const guardedPlain =
      guard?.type === 'atrule' &&
      guard.name === 'supports' &&
      guard.params === '(color: color-mix(in srgb, black, white))' &&
      rule.selectors.every((selector) => plainRules.get(normalize(selector))?.has(declaration.prop))
    expect(
      previousPlain ||
        guardedPlain ||
        fallbackRules.get(normalize(rule.selector))?.has(declaration.prop),
      `${file}: ${rule.selector} / ${declaration.prop}`
    ).toBe(true)
  })
}

it('covers mixed values with plain declarations or feature queries', () => {
  for (const { file, css } of styles('src')) assertFallbacks(file, css)
})

it('requires a plain fallback for every selector in a positive feature query', () => {
  const guarded =
    '@supports (color: color-mix(in srgb, black, white)) { .a, .b { --track: color-mix(in srgb, black, white); } }'
  expect(() => assertFallbacks('fixture', '.a, .b { --track: gray; }' + guarded)).not.toThrow()
  expect(() => assertFallbacks('fixture', '.a { --track: gray; }' + guarded)).toThrow()
  expect(() => assertFallbacks('fixture', guarded + '.a, .b { --track: gray; }')).toThrow()
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
