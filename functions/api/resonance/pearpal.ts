/** Legacy clients receive an explicit response; credentials are no longer forwarded. */
export async function onRequestPost(): Promise<Response> {
  return Response.json(
    { error: 'pearpal_proxy_retired' },
    { status: 410, headers: { 'cache-control': 'no-store' } }
  )
}
