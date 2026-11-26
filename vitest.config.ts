import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { readFile } from 'node:fs/promises'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'test-json-resource-urls',
      enforce: 'pre',
      async load(id) {
        if (id.includes('/src/data/gongeo/') && id.endsWith('.json?url')) {
          const data = await readFile(id.slice(0, -4))
          return `export default ${JSON.stringify('data:application/json;base64,' + data.toString('base64'))}`
        }
      }
    }
  ],
  test: {
    setupFiles: ['./tests/setupBrowser.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/components/**', 'jsdom'],
      ['tests/App.test.ts', 'jsdom'],
      ['tests/likeCounter.test.ts', 'jsdom'],
      ['tests/utils/bodyScrollLock.test.ts', 'jsdom'],
      ['tests/utils/fileSystem.test.ts', 'jsdom'],
      ['tests/utils/outfitCodeParser.test.ts', 'jsdom'],
      ['tests/utils/outfitImage.test.ts', 'jsdom'],
      ['tests/utils/statusNotice.test.ts', 'jsdom']
    ],
    include: ['tests/**/*.test.ts']
  }
})
