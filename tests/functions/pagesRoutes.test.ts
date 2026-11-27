import { expect, it } from 'vitest'
import { staticAssetRoutes } from '../../scripts/pages-routes'

it('bypasses only existing resources, preserving API, HTML and missing-path handling', () => {
  const routes = staticAssetRoutes([
    'assets/app.js',
    'assets/app.js',
    'scripts/tool.user.js',
    'sw.js',
    'index.html',
    '404.html',
    'api/file.json',
    'API/file.json',
    '_routes.json',
    '_headers',
    'assets/星梦.webp',
    'assets/a*.js'
  ])
  expect(routes.include).toEqual(['/*'])
  expect(routes.exclude).toEqual(
    ['/assets/app.js', '/assets/%E6%98%9F%E6%A2%A6.webp', '/scripts/tool.user.js', '/sw.js'].sort()
  )
  expect(routes.exclude).not.toContain('/assets/missing.js')
})

it('stays within Pages limits without wildcard broadening', () => {
  const files = Array.from({ length: 120 }, (_, i) => `assets/${i}.js`)
  files.push('assets/' + 'a'.repeat(100) + '.js')
  const routes = staticAssetRoutes(files)
  expect(routes.exclude).toHaveLength(99)
  expect(routes.exclude.every((path) => path.length <= 100 && !path.includes('*'))).toBe(true)
})
