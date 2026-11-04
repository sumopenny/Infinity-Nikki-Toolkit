import { build } from 'vite'
import type { OutputChunk } from 'rollup'
import { expect, it } from 'vitest'

it('includes static components in the initial production dependency graph and keeps optional features separate', async () => {
  const result = await build({ logLevel: 'silent', build: { write: false } })
  if (Array.isArray(result) || !('output' in result))
    throw new Error('Expected a single app bundle')
  const chunks = new Map(
    result.output
      .filter((item): item is OutputChunk => item.type === 'chunk')
      .map((chunk) => [chunk.fileName, chunk])
  )
  const entry = [...chunks.values()].find((chunk) => chunk.isEntry)!
  expect(entry).toBeDefined()
  const initial = new Set<OutputChunk>()
  function visit(chunk: OutputChunk) {
    if (initial.has(chunk)) return
    initial.add(chunk)
    chunk.imports.forEach((name) => {
      const imported = chunks.get(name)
      if (imported) visit(imported)
    })
  }
  visit(entry)
  const modules = [...initial]
    .flatMap((chunk) => Object.keys(chunk.modules))
    .map((id) => id.replaceAll('\\', '/'))
  for (const component of [
    'ArchiveCloudDialog',
    'UpdateLogDialog',
    'HelpAboutDialog',
    'OutfitEditor',
    'OutfitGuideDialog',
    'OutfitParseDialog',
    'ParseToolsDialog',
    'FortuneTimeDialog',
    'HomeSchemeWorkspace',
    'ResonanceRecords',
    'PersonalWardrobe',
    'ResonanceSidebar',
    'PhotoParamsDialog',
    'CameraFavorites',
    'CameraImportConflictDialog',
    'WardrobeRestoreRegionDialog'
  ]) {
    expect(
      modules.some((id) => id.includes(`/components/${component}.vue`)),
      component
    ).toBe(true)
  }
  for (const component of ['OutfitSummaryDialog', 'ShareImageDialog']) {
    expect(
      modules.some((id) => id.includes(`/components/${component}.vue`)),
      component
    ).toBe(false)
  }
  const catalogPrefix = '/data/gongeo/'
  const initialCatalogFiles = modules
    .filter((id) => id.includes(catalogPrefix))
    .map((id) => id.split(catalogPrefix)[1])
  expect(initialCatalogFiles.sort()).toEqual([
    'banners.json',
    'filterMetadata.json',
    'locales/en/banner.json',
    'locales/zh/banner.json'
  ])
  expect(modules.some((id) => id.endsWith('/lookbookWasmClient.ts'))).toBe(false)
}, 60000)
