# 正式数据目录

本次整理于 2026-11-06。正式数据共 22 个 JSON；图片已接入 ImageKit。

| 路径 | 数量 | 来源与用途 |
|---|---:|---|
| `gongeo/*.json` | 9 | GitHub 目录及本地派生的筛选、来源记录 |
| `gongeo/locales/{zh,en}/{item,outfit,banner}.json` | 6 | GitHub 中英文名称 |
| `itemCatalog.json` | 1 | GitHub 部件、整妆名称合并生成 |
| `photo/photoResourceCatalog.json` | 1 | 自有拍照资源目录及图片映射 |
| `wardrobe/itemImageMap.json` | 1 | ID 到自有 Showpic 图片文件名映射 |
| `wardrobe/itemIconMap.json` | 1 | 游戏 V2 配置中的部件图标引用 |
| `wardrobe/outfitImageMap.json` | 1 | GitHub 套装成员与游戏资源编号交叉关联的套装图片 |
| `outfits/locales/{zh,en}/outfitDescriptions.json` | 2 | 自提取的套装中英文描述 |

## GitHub 数据

默认仓库：https://github.com/dastrokes/gongeo.us-nikki-tracker ，分支 master。
使用 `scripts/update-gongeo-catalog.mjs` 同步 gongeo 下的 15 个 JSON，使用
`scripts/generate-item-catalog.cjs --remote` 生成 itemCatalog.json。
实际版本见 `gongeo/catalogSource.json`。

套装名称仅使用 GitHub 版本，不引入外部输出目录中的 outfit.zh.json / outfit.en.json，
也不补入该本地版本独有的三个 ID。

## 自有数据

四份自有输入来自 `D:/desktop/Output/最终数据文件`。项目拍照目录已精简说明字段，
并补入20个游戏配置关联的大喵动作（共667动作，其中98条无图）。
描述文件按语言目录组织，内容未改；套装名称使用GitHub快照，描述直接读取本地双语文件，缺失描述显示为空，不回退外部API。

## 图片读取

- nikkicube/images：outfits、IconClothes、poses、momo-poses、lights、filters。
- nikkicubeassets/images/itemDetails：Showpic条目详情及整妆展示。
- 所有请求使用 `?tr=f-webp,q-70`，文件映射保留 PNG 名称。
- 所有拍照类别统一读取 image，按路径分段编码；缺少 image 不请求图片。
- 未映射服装显示本地占位图，不回退旧 CDN；历史记录中的旧 CDN URL 不自动转换。
- 分享代理仅允许正式映射中带指定 WebP 参数的完整地址，按完整URL精确白名单校验，旧CDN和非当前质量参数地址不转发。
- itemImageMap 的非数字元数据键不参与图片请求；文件名大小写按本地导出校正。

## 更新

启动/构建只同步 GitHub 数据，不再同步旧拍照数据库或 NikkiGallery。
resources:update:poses 与 resources:update:light-filters 仅校验本地新目录。
旧第三方拍照生成脚本及其专属测试已移除。
新增图标/套装映射与大喵关联可用 `python scripts/build-imagekit-maps.py D:/desktop/Output` 重建，
需要该目录中的游戏导出与解析报告。套装图片关联是成员资源编号推断，非完整游戏套装表解码。
当前792/800套装已映射，未映射ID：10029、10431、10455、20057、1043101、1043102、1045501、1045502。
GitHub更新新增条目后需重新生成映射；未映射条目仍显示占位图。

部件名称目录9008个ID中8932个有图标映射，76个显示占位图；100个整妆ID中99个有Showpic映射。
原itemImageMap仍保留此前36个ID（28张本地缺图）的文件名，不将映射存在等同于远端已验证。
此前q90抽检51个地址全部200 image/webp；本轮q70样本验证返回200 image/webp及一年浏览器缓存响应头，均不代表全量图床验证。

本轮已撤回新增CSP、Service Worker更新与拦截、入口缓存响应头；不宣称旧页面已停止访问旧CDN。
