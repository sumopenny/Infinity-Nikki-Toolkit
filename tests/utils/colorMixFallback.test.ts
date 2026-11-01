import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { compileStyle } from '@vue/compiler-sfc'

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
  let checked = 0
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
      checked++
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
  // Count is deliberately a floor: it catches accidentally bypassing the scan without
  // requiring obsolete color-mix declarations to remain in the codebase.
  expect(checked).toBeGreaterThan(70)
})

it('shares pink dialog fallback aliases without affecting other panel colors or scoped CSS', () => {
  const root = postcss.parse(readFileSync('src/styles/dialogs.css', 'utf8'))
  const fallback = root.nodes.find(
    (node) =>
      node.type === 'atrule' &&
      node.name === 'supports' &&
      node.params === 'not (color: color-mix(in srgb, black, white))' &&
      node.nodes?.some(
        (child) =>
          child.type === 'rule' &&
          child.selector.includes('.resonance-cloud-panel') &&
          child.selector.includes('.outfit-editor-panel')
      )
  )
  expect(fallback?.type).toBe('atrule')
  if (fallback?.type !== 'atrule') return
  const rules = (fallback.nodes ?? []).filter((node) => node.type === 'rule')
  expect(rules).toHaveLength(2)
  const [light, dark] = rules
  const panels = [
    'photo-params-dialog',
    'parse-tools-panel',
    'photo-transfer-dialog',
    'outfit-editor-panel',
    'resonance-cloud-panel'
  ]
  expect(light?.selector.replace(/\s+/g, '').startsWith(':is(')).toBe(true)
  expect(
    [...(light?.selector.matchAll(/\.([\w-]+)/g) ?? [])].map((match) => match[1])
  ).toEqual(panels)
  expect(dark?.selector.replace(/\s+/g, '')).toBe(
    ":where(:root[data-theme='dark'])" + light?.selector.replace(/\s+/g, '')
  )
  for (const rule of rules) {
    expect(rule.nodes.filter((node) => node.type === 'decl')).toHaveLength(9)
  }
  // Scoped component rules remain scoped; only shared fallback aliases are in global CSS.
  const file = 'src/components/CloudDialog.vue'
  const source = readFileSync(file, 'utf8').match(/<style scoped>([\s\S]*?)<\/style>/)![1]!
  const result = compileStyle({ source, filename: file, id: 'data-v-compat-check', scoped: true })
  expect(result.errors).toEqual([])
  expect(result.code).toContain('.resonance-cloud-panel[data-v-compat-check]')
  expect(result.code).not.toContain('--compat-dialog-border')
})

it('keeps fallback cascade order and does not raise dark selector specificity', () => {
  for (const { file, css } of styles('src')) {
    const root = postcss.parse(css)
    root.walkAtRules('supports', (query) => {
      if (query.params !== 'not (color: color-mix(in srgb, black, white))') return
      const lightRule = query.nodes?.[0]
      // Shared aliases intentionally cover multiple panels; their scope/cascade is tested above.
      if (lightRule?.type === 'rule' && lightRule.selector.trim().startsWith(':is(')) {
        expect(file).toContain('dialogs.css')
        return
      }
      const original = query.prev()
      expect(original?.type, file).toBe('rule')
      if (original?.type !== 'rule') return
      const light = query.nodes?.[0]
      expect(light?.type, file).toBe('rule')
      if (light?.type === 'rule')
        expect(light.selector.replace(/\s+/g, ''), file).toBe(original.selector.replace(/\s+/g, ''))
      query.walkRules((rule) => {
        if (rule.selector.includes('data-theme') && !original.selector.includes(':root'))
          expect(rule.selector, file).toContain(":where(:root[data-theme='dark'])")
      })
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
