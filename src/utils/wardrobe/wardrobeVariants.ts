/** ID 编码区分版本；不能按紧凑行下标猜测，因为部分家族缺少中间版本。 */
export function itemVariant(id: string, root?: string): number {
  if (id === root) return 0
  // 3.0 新部件使用 202 前缀，进化位仍是第四位；其余物品编号不参与推导。
  if (!/^(?:102|202)\d{7}$/.test(id)) return 0
  return (
    ({ '2': 1, '6': 1, '7': 1, '8': 1, '3': 2, '4': 3, '5': 4 } as Record<string, number>)[id[3]] ??
    0
  )
}

export function outfitVariant(id: string): number {
  return id.length === 7 ? Number(id.slice(-2)) : 0
}
