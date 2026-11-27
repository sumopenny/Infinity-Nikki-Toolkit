import type { Language } from '../../i18n'

// 类型编号与暖暖相册 ClothType 枚举保持一致。
const CLOTH_TYPE_LABELS: Record<number, Record<Language, string>> = {
  10: { zh: '发型', en: 'Hair' },
  90: { zh: '连衣裙', en: 'Dresses' },
  20: { zh: '外套', en: 'Outerwear' },
  30: { zh: '上衣', en: 'Tops' },
  41: { zh: '下装', en: 'Bottoms' },
  50: { zh: '袜子', en: 'Socks' },
  60: { zh: '鞋子', en: 'Shoes' },
  71: { zh: '头饰', en: 'Hair Accessories' },
  72: { zh: '帽子', en: 'Headwear' },
  73: { zh: '耳饰', en: 'Earrings' },
  74: { zh: '颈饰', en: 'Neckwear' },
  75: { zh: '腕饰', en: 'Bracelets' },
  76: { zh: '项圈', en: 'Chokers' },
  77: { zh: '手套', en: 'Gloves' },
  78: { zh: '手持物', en: 'Handhelds' },
  79: { zh: '肤绘', en: 'Body Paint' },
  80: { zh: '全妆', en: 'Full Makeup' },
  81: { zh: '底妆', en: 'Base Makeup' },
  82: { zh: '眉妆', en: 'Eyebrows' },
  83: { zh: '睫毛', en: 'Eyelashes' },
  84: { zh: '美瞳', en: 'Contacts' },
  85: { zh: '唇妆', en: 'Lips' },
  86: { zh: '肤色', en: 'Skin Tones' },
  92: { zh: '面饰', en: 'Face Decorations' },
  93: { zh: '胸饰', en: 'Chest Accessories' },
  94: { zh: '挂饰', en: 'Pendants' },
  95: { zh: '背饰', en: 'Backpieces' },
  96: { zh: '戒指', en: 'Rings' },
  97: { zh: '臂饰', en: 'Arm Decorations' }
}

// 原生搭配码只保存部件 ID。ID 的六位分类前缀末两位与 ClothType 一致，
// 但 98 是项圈的另一组资源前缀，需要归并到 76。
const ITEM_ID_CATEGORY_TYPES: Record<number, number> = {
  10: 10,
  20: 20,
  30: 30,
  41: 41,
  50: 50,
  60: 60,
  71: 71,
  72: 72,
  73: 73,
  74: 74,
  75: 75,
  76: 76,
  77: 77,
  78: 78,
  79: 79,
  80: 80,
  81: 81,
  82: 82,
  83: 83,
  84: 84,
  85: 85,
  86: 86,
  90: 90,
  92: 92,
  93: 93,
  94: 94,
  95: 95,
  96: 96,
  97: 97,
  98: 76
}

/** 从原生部件 ID 推导 ClothType；无法识别时返回 null。 */
export function inferClothTypeFromItemId(itemId: number): number | null {
  if (!Number.isSafeInteger(itemId)) return null
  // 3.0 的 202 系列沿用 102 系列的分类位，保留其他物品类型的拒绝条件。
  const series = Math.floor(itemId / 10000000)
  if (series !== 102 && series !== 202) return null
  if (itemId === 1020790033) return 96
  const categoryPrefix = Math.floor(itemId / 10000)
  return ITEM_ID_CATEGORY_TYPES[categoryPrefix % 100] ?? null
}

export function getClothTypeLabel(clothType: number | null, language: Language): string | null {
  return clothType === null ? null : (CLOTH_TYPE_LABELS[clothType]?.[language] ?? null)
}
