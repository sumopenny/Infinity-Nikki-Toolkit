import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** 只放行本次构建存在的非 HTML 资源；未知路径和 API 仍经过边界处理。 */
export function staticAssetRoutes(files: string[]) {
  const exclude = [...new Set(files)]
    .filter(
      (file) =>
        !file.startsWith('_') &&
        !/^api(?:\/|$)/i.test(file) &&
        /\.[^/]+$/.test(file) &&
        !/\.html?$/i.test(file)
    )
    .map((file) => '/' + file.split('/').map(encodeURIComponent).join('/'))
    .filter((path) => path.length <= 100 && !path.includes('*'))
    .sort()
    // include 占一条，超出上限的资源继续走 middleware，不能用宽泛通配符代替。
    .slice(0, 99)
  return { version: 1, include: ['/*'], exclude }
}

export function pagesRoutes(): Plugin {
  return {
    name: 'pages-static-routes',
    apply: 'build',
    async writeBundle(options) {
      const directory = resolve(options.dir ?? 'dist')
      const entries = await readdir(directory, { recursive: true, withFileTypes: true })
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const absolute = resolve(entry.parentPath, entry.name)
          return absolute.slice(directory.length + 1).replaceAll('\\', '/')
        })
      await writeFile(
        resolve(directory, '_routes.json'),
        JSON.stringify(staticAssetRoutes(files), null, 2) + '\n'
      )
    }
  }
}
