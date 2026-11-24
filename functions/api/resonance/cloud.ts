import { handleCloud, type CloudEnv } from '../../_lib/resonanceCloud'

/** Worker handlers 同源入口，通过 RESONANCE_DB 绑定访问共鸣专用 D1。 */
export function onRequest(context: {
  request: Request
  env: CloudEnv
  data?: Record<string, unknown>
}) {
  return handleCloud(context.request, context.env, (error, detail) => {
    if (context.data) context.data.diagnosticFailure = { error, ...detail }
  })
}
