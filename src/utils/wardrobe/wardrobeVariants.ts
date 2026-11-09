/** ID 编码区分版本；不能按紧凑行下标猜测，因为部分家族缺少中间版本。 */
export function itemVariant(id: string, root?: string): number {
  if (id === root) return 0
  return (
    (
      { '1022': 1, '1026': 1, '1027': 1, '1028': 1, '1023': 2, '1024': 3, '1025': 4 } as Record<
        string,
        number
      >
    )[id.slice(0, 4)] ?? 0
  )
}

export function outfitVariant(id: string): number {
  return id.length === 7 ? Number(id.slice(-2)) : 0
}
