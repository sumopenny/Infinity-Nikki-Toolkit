const resourceFetch = globalThis.fetch

/** Keep bundled JSON fixtures separate from mocks for external service requests. */
export function withCatalogResources(serviceFetch: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return url.startsWith('data:application/json;')
      ? resourceFetch(input, init)
      : serviceFetch(input, init)
  }
}
