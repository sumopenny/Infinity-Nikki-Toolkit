import type { Language } from '../../i18n/types'
export const wardrobeVariantLabels: Record<Language, readonly string[]> = {
  zh: ['原套', '焕新', '一进', '二进', '满进'],
  en: ['Original', 'Glow-up', 'Evo. 1', 'Evo. 2', 'Evo. 3']
}
export const wardrobeCategoryLabels: Record<Language, readonly string[]> = {
  zh: [
    '发型',
    '外套',
    '鞋子',
    '发饰',
    '帽子',
    '耳饰',
    '颈饰',
    '项圈',
    '连衣裙',
    '胸饰',
    '手持物',
    '袜子',
    '手套',
    '面饰',
    '背饰',
    '上衣',
    '腕饰',
    '臂饰',
    '挂饰',
    '下装',
    '肤绘',
    '戒指'
  ],
  en: [
    'Hair',
    'Outerwear',
    'Shoes',
    'Hair accessories',
    'Headwear',
    'Earrings',
    'Neckwear',
    'Chokers',
    'Dresses',
    'Chest accessories',
    'Handhelds',
    'Socks',
    'Gloves',
    'Face decorations',
    'Backpieces',
    'Tops',
    'Bracelets',
    'Arm decorations',
    'Pendants',
    'Bottoms',
    'Body paint',
    'Rings'
  ]
}

export const wardrobeOwnershipNotice: Record<
  Language,
  { title: string; body: string; close: string }
> = {
  zh: {
    title: '收集状态说明',
    body: '衣橱根据导入的共鸣记录及已集齐套装信息识别收集情况，可能遗漏散件及进化／焕新形态。“未拥有”仅表示当前导入数据中未识别到拥有记录，不代表游戏内实际未拥有，请以游戏内衣橱为准。',
    close: '关闭收集状态说明'
  },
  en: {
    title: 'Collection status information',
    body: 'Collection status is identified from imported resonance records and completed outfits. Individual pieces and evolution or glow-up variants may be missing. “Not owned” only means no ownership record was identified in the current import; it does not confirm that you lack the item in game. Refer to your in-game wardrobe.',
    close: 'Dismiss collection status information'
  }
}

interface WardrobeEvolutionMessages {
  label: string
  enabledHint: string
  disabledHint: string
  expand: string
  collapse: string
  forms: string
}

export const wardrobeEvolutionMessages: Record<Language, WardrobeEvolutionMessages> = {
  zh: {
    label: '显示进化形态',
    expand: '展开形态',
    collapse: '收起形态',
    forms: '进化形态',
    enabledHint: '开启：界面显示套装所有形态',
    disabledHint: '关闭：每个套装系列合并为一张卡片'
  },
  en: {
    label: 'Show evolution forms',
    expand: 'Expand forms',
    collapse: 'Collapse forms',
    forms: 'Evolution forms',
    enabledHint: 'When on: show all outfit forms',
    disabledHint: 'When off: each outfit family shares one card'
  }
}
