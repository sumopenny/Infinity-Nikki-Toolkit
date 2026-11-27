import { readFileSync } from 'node:fs'

// 测试跟随实际部署日期，避免升级配置后仍在旧兼容行为下验证。
const date = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
  .match(/^compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/m)?.[1]
if (!date) throw new Error('Missing compatibility_date in wrangler.toml')
export const compatibilityDate = date
