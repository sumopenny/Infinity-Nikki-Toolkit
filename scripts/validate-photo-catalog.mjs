import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const catalog = JSON.parse(
  await readFile(new URL('../src/data/photo/photoResourceCatalog.json', import.meta.url), 'utf8')
)
assert.equal(catalog.schemaVersion, 3)
for (const kind of ['light', 'filter', 'pose']) {
  assert.ok(catalog.templates[kind].baseUrl.startsWith('https://ik.imagekit.io/nikkicube/images/'))
  const ids = new Set()
  for (const entry of catalog.resources[kind]) {
    assert.ok(!ids.has(entry.key), `Duplicate ${kind} ID: ${entry.key}`)
    ids.add(entry.key)
    assert.ok(entry.zh && entry.en && Array.isArray(entry.aliases))
    if (entry.image) assert.ok(!entry.image.includes('..') && !entry.image.includes('://'))
  }
}
console.log('Local ImageKit photo catalog validated; no external catalog downloaded.')
