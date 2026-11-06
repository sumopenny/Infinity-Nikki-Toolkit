/** 公共图鉴图片路径集中管理；仅使用现有原图来源，不接入转换服务。 */
export function getCatalogImageSource(
  kind: 'outfit' | 'item' | 'icon' | 'makeup',
  id: string | number
) {
  const directories = {
    outfit: 'outfits',
    item: 'items',
    icon: 'items/icons',
    makeup: 'items/makeups'
  }
  return `https://cdn.gongeo.us/images/${directories[kind]}/${id}.png`
}

export const catalogImageLoading = (index: number) => (index < 6 ? 'eager' : 'lazy')
export const catalogImagePriority = (index: number) => (index === 0 ? 'high' : 'auto')
