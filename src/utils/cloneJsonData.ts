/** Only for JSON-backed records/manifests; never pass Blob, handles, Map or Date. */
export function cloneJsonData<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}
