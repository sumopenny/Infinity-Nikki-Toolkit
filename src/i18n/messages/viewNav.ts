// 视图导航文案：相册视图、收藏视图、搭配码视图和最近删除视图的名称及数量文字。
import type { LocaleMessages } from '../types'

export const viewNavZh: LocaleMessages['viewNav'] = {
  aria: '相册视图',
  title: '相册',
  allPhotos: '全部照片',
  homeSchemes: '家园方案',
  resonance: '暖暖档案',
  resonanceRecords: '共鸣记录',
  wardrobe: '个人衣橱',
  makeup: '妆容图鉴',
  comingSoon: '其余模块开发中',
  favorites: '参数与收藏',
  recentlyDeleted: '最近删除',
  count: (count) => `${count} 张`,
  homeSchemesCount: (count) => `${count} 个方案`
}
export const viewNavEn: LocaleMessages['viewNav'] = {
  aria: 'Album views',
  title: 'Album',
  allPhotos: 'All photos',
  homeSchemes: 'Home schemes',
  resonance: 'Nikki Archive',
  resonanceRecords: 'Resonance records',
  wardrobe: 'Personal wardrobe',
  makeup: 'Makeup catalog',
  comingSoon: 'More modules coming soon',
  favorites: 'Favorites',
  recentlyDeleted: 'Recently deleted',
  count: (count) => `${count} photos`,
  homeSchemesCount: (count) => `${count}`
}
