import { currentVersion } from '../version'
// 更新记录文案：当前版本和历史版本保持结构化，便于发布时维护。
import type { FullLocaleMessages } from '../types'

export const updateLogZh: FullLocaleMessages['updateLog'] = {
  title: '更新记录',
  helpAbout: '使用帮助',
  currentTitle: '当前版本',
  currentVersion,
  currentDate: '2026.11.04 更新',
  currentItems: [
    {
      title: '新增电脑端自动备份功能。',
      text: '为了更好地保护大家的数据，强烈建议电脑端用户开启自动备份！电脑端顶部新增「自动备份」入口，支持将搭配码、家园方案和相机参数收藏自动备份到指定的电脑本地文件夹，三个模块可自由选择开启。数据发生变化时会自动增量备份，也支持从备份目录恢复数据，有效降低浏览器数据意外丢失的风险。特别说明：自动备份的数据保存在你自己的电脑本地文件夹中，不会上传至云端。'
    },
    {
      title: '优化界面动画与显示效果。',
      text: '优化页面卡片、弹窗及部分交互动画，让界面切换更加自然流畅，操作反馈更加细腻，整体视觉体验更加舒适。'
    }
  ],
  historyTitle: '历史版本记录',
  history: [
    {
      version: 'v2.5',
      date: '2026.11.03',
      items: [
        {
          title: '从桌面打开暖立方轻量应用。',
          text: '打开「更多 → 安装应用」，按提示将暖立方添加到手机主屏幕或电脑桌面。安装后，点击图标即可打开；支持的浏览器还可在独立窗口中运行。'
        },
        {
          title: '新增「搭配总结」。',
          text: '查看常用标签、常穿部件和常用妆容排行。可按部位筛选，点击标签即可查看对应搭配。优先读取本机已有的解析记录，剩余搭配码可一键批量解析。'
        },
        {
          title: '优化分享图预览界面。',
          text: '分享图预览采用与大图预览一致的样式，图片展示更清晰。'
        },
        {
          title: '只填搭配码也能保存。',
          text: '新建搭配时，填写搭配码或添加图片，任选其一即可保存。只有图片的搭配会归入「待填写」，方便之后补上搭配码。'
        }
      ]
    },
    {
      version: 'v2.4',
      date: '2026.11.01',
      items: [
        {
          title: '新增照片与搭配码分享图功能。',
          text: '照片支持从卡片或参数窗口进入分享，自由选择附带“图片参数”“穿搭部件”和“相机参数码”；搭配码支持从卡片或解析窗口生成包含搭配图片与搭配码的 9:16 竖版分享卡。'
        },
        {
          title: '参数解析信息补充。',
          text: '新增独立的“缩放”倍数，支持显示动态动作的播放进度（仅 2.11 版本之后的照片）。天气信息补充风力和风向，例如“晴天 小风 南风”。'
        },
        {
          title: '大图预览布局与交互优化。',
          text: '图片充分利用屏幕空间，风格样式全面优化。'
        },
        {
          title: '相机参数收藏接入大图预览。',
          text: '双击有封面的卡片即可查看大图。支持缩放、拖动及前后切换，也可直接复制参数、编辑收藏和查看详情。'
        },
        {
          title: '批量操作工具栏样式优化。',
          text: '调整为紧凑分组样式，通过文字颜色区分不同操作。'
        },
        {
          title: '作者主页入口补充。',
          text: '“更多”菜单新增 B 站主页入口，并更新抖音主页链接。'
        }
      ]
    },
    {
      version: 'v2.3',
      date: '2026.10.30',
      items: [
        {
          title: '照片里的穿搭，现在也能解析了！',
          text: '解析游戏原图，可同时查看拍摄参数和穿搭部件。点击部件还能查看所属套装、进化形态、染色条件，以及染色情况，方便还原喜欢的搭配。'
        },
        {
          title: '照片解析窗口支持两种布局。',
          text: '电脑端可自由切换上下排列或左右分栏，并记住你的选择；手机端自动上下排列。同步优化窗口比例、背景和滚动体验，让参数与穿搭更方便对照查看。'
        },
        {
          title: '衣橱支持合并展示进化形态。',
          text: '新增“显示进化形态”开关：开启时展示全部形态，关闭时将同系列合并为一张卡片，让衣橱更清爽。显示偏好会自动保存，合并后仍可展开查看其他形态。'
        },
        {
          title: '套装与部件详情支持快速切换形态。',
          text: '在衣橱和搭配解析详情中，可直接浏览同系列的不同形态及拥有状态，无需退出后重新查找。'
        },
        {
          title: '共鸣与衣橱云同步合二为一。',
          text: '在同一个窗口中管理共鸣记录和个人衣橱，可单独同步，也可一起上传、下载或删除云端存档。操作前可对照本机与云端记录，查看更新时间、覆盖范围和区服变化。'
        },
        {
          title: '云同步提示更清楚，存档保护更完善。',
          text: '本机或云端记录发生变化时，会提醒重新确认，避免覆盖刚更新的数据。完善同步失败时的原记录保护；某个模块异常时，也有更明确的提示。'
        },
        {
          title: '新增“兼容打开（只读）”相册模式。',
          text: '普通授权无法打开相册文件夹时，可尝试此模式，继续浏览、解析、收藏和导出照片，支持分包 ZIP 下载。照片仅在本地读取，不修改原文件；刷新网页或查看新照片时需重新选择文件夹。只读模式不支持修改备注、删除、恢复和专项清理，收藏与普通模式分别保存。'
        },
        {
          title: '网站打开更轻快。',
          text: '衣橱、共鸣、相机收藏、解析工具及图鉴内容会在需要时加载，减少首次打开的等待。优化大量收藏封面的加载与滚动表现，减少后台资源占用。'
        },
        {
          title: '加载与重试更顺畅。',
          text: '页面或窗口加载失败时可重新尝试，导入过程中也能更顺畅地取消退出。修复部分窗口首次打开、关闭后重新打开，以及取消操作后内容再次弹出的问题。'
        },
        {
          title: '照片解析失败后，重试更方便。',
          text: '手动输入 UID 后可看到解析进度，失败时会显示更清楚的原因，并方便继续修改重试。补充游戏原图位置提示，帮助确认照片来源。'
        },
        {
          title: '备份导入提示更易懂。',
          text: '选错备份类型、文件过大、图片缺失或备份损坏时，会给出对应提示。误将总备份导入相机收藏时，会指引前往正确入口；同步优化恢复后的提示和下载保存按钮。'
        },
        {
          title: '清除数据前，先看清楚、再做决定。',
          text: '重新优化清除确认窗口，清楚列出会删除和会保留的内容，并新增“先导出备份”快捷入口。'
        },
        {
          title: '抽卡吉时更新至游戏 2.11 版本。',
          text: '更新推荐日期、时段、方位与主推排序，新增“需避开生肖”提示，供娱乐参考。'
        },
        {
          title: '衣橱详情更清晰。',
          text: '优化套装总览、收集进度、属性、版本、描述和部件列表的排版；电脑端新增来源标签，不同信息使用更容易区分的配色。'
        },
        {
          title: '手机端浏览更舒适。',
          text: '优化衣橱形态切换、详情窗口和操作区布局，共鸣页套装快速导航改为双列。'
        },
        {
          title: '菜单与设置操作更快捷。',
          text: '电脑端顶部菜单支持鼠标悬停展开。主题与语言切换即时生效，并优化切换动画和选中提示。'
        },
        {
          title: '统一打磨浅色、深色主题与界面细节。',
          text: '优化按钮、菜单、标签、输入框、卡片和弹窗的配色、圆角、阴影及操作反馈。同步调整相机收藏标签、家园信息区、衣橱提示、共鸣卡片和导入文本框，让各页面的观感更协调，并改善部分旧版浏览器的显示。'
        },
        {
          title: '其他修复与优化。',
          text: '修复部分资源数据解析异常，优化缓存清理和导入取消操作。'
        }
      ]
    },
    {
      version: 'v2.2',
      items: [
        {
          title: '全新网站图标：',
          text: '粉色透明礼盒里装着精致裙装与星光，周围环绕着丝带。寓意把暖暖世界中的每一份心动，都珍藏进小小的魔法盒里。同步更新网站顶栏、浏览器标签页与启动器图标。'
        },
        {
          title: '新增衣橱云同步：',
          text: '与共鸣共用账号，独立管理云端存档。'
        },
        {
          title: '缩略图大小独立设置：',
          text: '相册、搭配码、家园和相机参数新增小／中／大三档，图片比例与大小独立设置。'
        },
        {
          title: '优化照片解析：',
          text: '顶部统一显示自动解析进度，减少失败照片重复解析，支持重新尝试；补充原图提示，改善错误显示。'
        },
        {
          title: '优化菜单与动画：',
          text: '电脑端的共鸣、衣橱新增“云端”菜单，新增日期树展开收起动画，改善 iOS 区服选择与键盘操作。'
        },
        {
          title: '新增故障诊断：',
          text: '完善各模块及云端错误追踪，帮助定位异常。'
        },
        {
          title: '修复与维护：',
          text: '修复家园保存后窗口关闭、长标签换行等问题，优化相机小图与收藏按钮样式。'
        }
      ]
    },
    {
      version: 'v2.1.2',
      items: [
        {
          title: '新增国际服共鸣与衣橱导入：',
          text: '支持国服及国际服亚服、美服、欧服、台港澳，登录入口随所选服务器切换，导入预览显示服务器与 UID。'
        },
        {
          title: '国际服使用反馈：',
          text: '开发者本人暂无国际服账号，无法进行全面的实测验证。国际服用户如遇到导入异常、数据展示错误或其他问题，请及时通过小红书向开发者反馈，帮助完善国际服支持。'
        }
      ]
    },
    {
      version: 'v2.1.1',
      items: [
        {
          title: '新增共鸣记录/衣橱导入视频教程：',
          text: '在“获取登录凭据”下方点击“电脑端”“安卓端”“苹果端”，即可前往小红书查看对应教程。'
        },
        {
          title: '档案导入新增进度展示：',
          text: '显示数据获取、格式检查、衣橱与共鸣记录解析、预览生成等处理阶段。'
        },
        {
          title: '修复图片导入与保存问题：',
          text: '改善多种图片格式的读取、预览及保存兼容性，修复部分图片选择后无法保存的问题。'
        },
        {
          title: '优化共鸣记录图片展示：',
          text: '调整套装与部件图片的边框及背景填充，减少边缘留白。'
        }
      ]
    },
    {
      version: 'v2.1',
      items: [
        {
          title: '个人衣橱模块上线：',
          text: '支持按状态、星级、进化阶段、游戏版本、风格、获取来源、标签及部位筛选。'
        },
        {
          title: '个人衣橱新增详情查看：',
          text: '点击套装卡片打开套装详情，查看收集进度、星级、风格、来源版本、介绍及部件列表；点击部件卡片打开部件详情。'
        },
        {
          title: '共鸣记录支持查看详情：',
          text: '点击套装图片打开套装详情，点击记录中的部件图片打开部件详情。'
        },
        {
          title: '搭配码解析新增套装详情入口：',
          text: '在解析结果中点击部件图片打开部件详情，再点击“所属套装”名称旁的跳转图标，即可查看对应套装详情。'
        },
        {
          title: '完善衣橱拥有状态识别：',
          text: '结合共鸣记录补充部分服装的拥有信息；星光小铺、服装商店、奇迹之冠、滚滚机、世界逸事来源中，未识别到的部件显示为“未知”。筛选上述来源时，自动切换到“未知”状态，并展示说明。'
        },
        {
          title: '优化共鸣记录排版：',
          text: '调整套装名称、星级及总抽数、平均抽数的展示；手机端“第一套／第二套”切换按钮移至卡片右上角，竖向排列，减少占位。'
        },
        {
          title: '优化顶部操作提示：',
          text: '连续操作时支持同时展示多条通知。'
        },
        {
          title: '调整入口名称：',
          text: '“共鸣”更名为“暖暖档案”，下设“共鸣记录”和“个人衣橱”。'
        },
        {
          title: '衣橱界面展示图：',
          text: '可前往小红书查看。',
          link: {
            label: '前往小红书',
            href: 'https://www.xiaohongshu.com/discovery/item/6ad4765c0000000028002402?source=webshare&xhsshare=pc_web&xsec_token=ABjeDe5Todarh39N7ZgKZAUc-FyPIeTAKg25qOtcSrOI0=&xsec_source=pc_share'
          }
        }
      ]
    },
    {
      version: 'v2.0.2',
      items: [
        {
          title: '共鸣记录展示升级：',
          text: '电脑端同时展示第一套、第二套部件，无需切换；手机端采用小立绘与全宽部件网格，可切换套数查看获得进度、本套已记录抽数和已知部件均抽，同时保留两套合计的总抽数与平均抽数。'
        },
        {
          title: '手机空页面新增展示图：',
          text: '搭配码、家园方案、相机参数和共鸣记录在暂无数据时展示对应UI展示图。'
        },
        {
          title: '改善手机图片上传兼容性：',
          text: '优化搭配图片和相机参数收藏封面的读取、预览及保存流程，处理选图后报错无法保存的问题。'
        }
      ]
    },
    {
      version: 'v2.0.1',
      items: [
        {
          title: '新增共鸣记录云同步：',
          text: '支持注册、登录账号，手动上传共鸣记录，并在电脑或手机登录同一账号下载，实现跨设备同步。每个账号保存一份云端存档；上传完整覆盖云端，下载完整覆盖本地，操作前可核对账号与记录数量。登录和本地修改不会自动同步。'
        },
        {
          title: '支持管理云端存档：',
          text: '登录后可确认删除云端共鸣存档，保留账号、登录状态和本地记录。'
        },
        {
          title: '调整共鸣导入方式：',
          text: '从奇美鸭梨或 JSON 文件导入时，确认后以本次预览结果替换全部本地共鸣记录。'
        },
        {
          title: '“清除数据”支持完整重置网站：',
          text: '确认后清除当前浏览器中的方案、图片、标签、共鸣记录、收藏及设置，重新加载回到初始状态。操作不可撤销，请先导出备份；电脑原文件及云端存档保留。'
        },
        {
          title: '优化使用逻辑和用户体验，',
          text: '并和大喵去吃了一顿大餐🍟🍔🍕🍝🍩'
        }
      ]
    },
    {
      version: 'v2.0',
      items: [
        {
          title: '手机网页版正式上线，界面全面升级！',
          text: '现在可以直接用手机浏览器管理搭配码、家园方案、相机参数收藏和共鸣记录，随时查看、整理与分享你的游戏灵感。新增底部四模块导航，重新设计顶部工具栏、卡片与操作布局，让常用功能更适合手机浏览和触摸操作。'
        },
        {
          title: '现有电脑端数据可迁移到手机：',
          text: '在电脑端“更多”中选择“导出全部数据”，将生成的 ZIP 文件传给手机，再用手机浏览器打开网站，在“更多”中选择“导入全部数据”，即可迁移搭配码、家园方案、相机参数收藏和共鸣记录。'
        },
        {
          title: '优化手机搜索与筛选：',
          text: '顶部放大镜支持搜索当前模块；标签窗口支持搜索、添加和拖拽排序，共鸣筛选集中提供卡池排序、星级筛选与套装快速定位。'
        },
        {
          title: '优化卡片与批量操作：',
          text: '常用操作统一放在卡片底部，方便复制、编辑、删除、解析。'
        },
        {
          title: '优化大图与编辑体验：',
          text: '支持单指滑动翻页、双指缩放和放大后拖动；优化弹窗布局、输入区域与软键盘避让，统一过渡动画和按压反馈。'
        },
        {
          title: '更新使用帮助与界面细节：',
          text: '手机和电脑分别展示对应的中英文帮助，优化排版、显示、视图设置及布局。'
        }
      ]
    },
    {
      version: 'v1.8.2',
      items: [
        {
          title: '搭配码与家园方案数据迁移至浏览器存储：',
          text: '搭配码、家园方案数据不再保存在所选相册文件夹中，改为存入浏览器并所有相册共用；进入对应页面后自动迁移旧数据，迁移成功自动清理旧文件夹。'
        },
        {
          title: '新增“导出全部数据 / 导入全部数据”：',
          text: '可在“更多”菜单中一键将搭配码、家园方案、相机参数收藏和共鸣记录打包到一个全部数据备份 ZIP 中。'
        },
        {
          title: '支持数据跨设备迁移：',
          text: '在电脑上导出全部数据，将 ZIP 并发送到手机，手机上打开网页即可导入数据并正常使用除相册外的其他模块。'
        },
        {
          title: '搭配码自动更新优化：',
          text: '无需先选择相册，授权 X6Game 文件夹即可使用自动更新。'
        },
        {
          title: '界面与体验优化：',
          text: '优化相关页面细节。'
        }
      ]
    },
    {
      version: 'v1.8.1',
      items: [
        {
          title: '新增相机参数收藏：',
          text: '将收藏夹分为“相机参数”和“照片收藏”，支持从照片参数解析窗口直接收藏，或输入相机参数码自动解析后保存。'
        },
        {
          title: '支持自定义名称、单标签分类、标签排序与搜索，',
          text: '以及参数复制、编辑、详情查看和批量删除。'
        },
        {
          title: '支持上传或更换收藏封面，',
          text: '保存时自动转换为 WebP。'
        },
        {
          title: '支持相机参数收藏 ZIP 备份导入与导出。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.8',
      items: [
        {
          title: '新增共鸣记录模块：',
          text: '支持从美鸭梨导入共鸣记录，提供登录凭据获取指引，预览确认后保存。电脑获取登录凭据cookie后发送给手机，用手机端访问网页也可输入凭据查看共鸣记录'
        },
        {
          title: '支持共鸣数据导入导出：',
          text: '兼容暖暖共鸣录新旧版 JSON 文件，可导出本工具备份；导入时更新对应套装，保留其他本地记录。'
        },
        {
          title: '展示套装获取详情：',
          text: '支持查看第一套、第二套部件抽数，以及套装总抽数和平均抽数；部件按获取顺序展示，兼容文件中的手动补录标记。'
        },
        {
          title: '支持快速定位、排序与筛选：',
          text: '通过侧栏快速定位套装，可按卡池最新或最早排序，并筛选五星、四星记录。'
        },
        {
          title: '云端同步、衣柜数据等功能正在开发中，',
          text: '敬请期待'
        }
      ]
    },
    {
      version: 'v1.7.1',
      items: [
        {
          title: '相册侧边栏新增“拍摄动作”分类：',
          text: '开启“自动解析动作”后，自动识别每张照片的拍照动作，按动作分组，支持按动作编号（新动作优先）、名称、照片数量、最近拍摄时间排序；未使用动作和未解析的照片单独成组。开关默认关闭，照片较多时网页可能卡顿，可按需开启。'
        },
        {
          title: '动作解析结果在浏览器本地缓存，',
          text: '重新打开相册无需重复解析；“清除缓存”“清除数据”会同步清理照片动作解析缓存。'
        }
      ]
    },
    {
      version: 'v1.7',
      items: [
        {
          title: '新增家园方案管理模块：',
          text: '支持添加家园码和组合码，输入方案码后自动解析方案名称、类型、版本、家具数量等信息。'
        },
        {
          title: '新增家园方案 ZIP 备份导入导出，',
          text: '导出文件放在当前所选相册文件夹中。'
        },
        {
          title: '“清除缓存”改为清理搭配码和家园方案解析缓存。',
          text: ''
        },
        {
          title: '优化使用体验，并改进标签按钮动画、加载提示等。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6.3',
      items: [
        {
          title: '搭配码解析新增部件类型标注：',
          text: '在部件名称后显示发型、头饰、睫毛等类型，方便快速辨认。'
        },
        {
          title: '新增可点击的部件详情：',
          text: '点击解析结果中的部件图片，可查看当前部件、所属套装及套装图、进化/焕新状态和染色条件；有染色数据时还会展示区域、染色盘、色号与颜色。'
        },
        {
          title: '暖立方官网页面已上线，',
          text: '并带暖暖去观摩了一下🤩'
        }
      ]
    },
    {
      version: 'v1.6.2',
      items: [
        {
          title: '新增本地照片参数解析：',
          text: '可在工具栏解析窗口中选择电脑、手机上的游戏原图进行拍摄参数解析。该功能手机也可用，手机解析时需手动输入拍摄照片用的账号的 UID 。'
        },
        {
          title: '品牌名称升级为“暖立方 / NikkiCube”，',
          text: '暖立方 Nikki³ | 为每一张心动留个位置——官方主题网站即将上线✨'
        },
        {
          title: '更新搭配码解析图鉴到2.10版本。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6.1',
      items: [
        {
          title: '新增选中照片后可删除对应低画质图片的功能：',
          text: '按名称匹配并永久删除当前账号 ScreenShot 和 NikkiPhotos_LowQuality 中的图片，保留当前相册原图。'
        },
        {
          title: '改版“更新记录”窗口，',
          text: '重新整理更新版本的展示。'
        },
        {
          title: '优化了一些问题并和暖暖出去看了场电影💅。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6',
      items: [
        {
          title: '新增照片参数解析功能，',
          text: '支持从照片缩略图右上角、大图预览工具栏或“工具”菜单解析，解析结果展示相机、环境、画面、动作、灯光、滤镜等参数，支持复制相机参数一键导入游戏。'
        },
        {
          title: '新增“工具”菜单，集中专项清理、抽卡吉时、参数/搭配码解析统一解析窗口。',
          text: ''
        },
        {
          title: '抽卡吉时更新为 2.10 内容。',
          text: ''
        },
        {
          title: '手机访问网页虽然不能管理相册，',
          text: '但可从工具菜单里使用相机参数、搭配码解析功能。'
        }
      ]
    },
    {
      version: 'v1.5',
      items: [
        {
          title: '新增搭配码解析功能：',
          text: '搭配码页面新增直接输入解析入口，搭配卡片右上角同步新增解析按钮。'
        },
        {
          title: '新增主页点赞功能。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.4.1',
      items: [
        {
          title: '取消 X6Game 授权相册限制。',
          text: ''
        },
        {
          title: '新增相册图片批量导入与导出功能。',
          text: ''
        },
        {
          title: '多选图片底栏支持导出选中图片。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.4',
      items: [
        {
          title: '新增相册图片批量导入与导出功能。',
          text: ''
        },
        {
          title: '导出时取消会保留已完成的目标文件和源照片。',
          text: ''
        },
        {
          title: '正常完成导出后，可选择将成功导出的源照片移入最近删除。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.3',
      items: [
        {
          title: '新增 2.9 版本抽卡吉时模块。',
          text: ''
        },
        {
          title: '提升 ZIP 导入导出、图片处理、批量删除和恢复及专项清理速度。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.2',
      items: [
        {
          title: '新增照片和搭配码备注功能。',
          text: ''
        },
        {
          title: '新增顶部搜索框，支持搜索文件名、搭配码和备注。',
          text: ''
        },
        {
          title: '提升 ZIP 导入导出、图片处理、批量删除和恢复及专项清理速度。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.1',
      items: [
        {
          title: '优化照片时间读取，无法从文件名读取时间时使用图片最后修改时间。',
          text: ''
        },
        {
          title: '新增更新记录入口。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.0 补充版',
      items: [
        {
          title: '新增专项清理窗口，支持清理低画质图片、截图、崩溃快照、运行日志和网页缓存。',
          text: ''
        },
        {
          title: '新增问题反馈入口。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.0',
      items: [
        {
          title: '新增专项清理窗口，支持清理低画质图片、截图、崩溃快照、运行日志和网页缓存。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2.3',
      items: [
        {
          title: '搭配码新增标签显示在列表首位，',
          text: '并支持拖拽调整顺序。'
        },
        {
          title: '优化动画效果和部分操作逻辑。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2.2',
      items: [
        {
          title: '优化搭配码导入导出性能。',
          text: ''
        },
        {
          title: '完善 X6Game 授权与清理逻辑。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2.1',
      items: [
        {
          title: '搭配码编辑窗口新增快捷创建标签功能。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2',
      items: [
        {
          title: '新增星绘图册搭配码管理模块。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.1.1',
      items: [
        {
          title: '优化 CSS 样式、页面布局和显示效果。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.1',
      items: [
        {
          title: '重新调整页面布局，使结构更合理、操作逻辑更清晰。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.0.2',
      items: [
        {
          title: '新增全部照片、收藏夹和最近删除视图。',
          text: ''
        },
        {
          title: '支持照片移入回收站、预览、恢复和永久删除。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.0.1',
      items: [
        {
          title: '新增图片懒加载，减少高分辨率照片造成的页面卡顿。',
          text: ''
        }
      ]
    },
    {
      version: 'v1.0.0',
      items: [
        {
          title: '初始版本：',
          text: '支持按日期管理和浏览照片、收藏夹、大图预览、键盘操作、缩略图比例调整，以及低画质照片和游戏截图清理。'
        }
      ]
    }
  ],
  dontShowAgain: '当前版本不再提示',
  confirm: '我知道了',
  closeAria: '关闭更新记录窗口'
}

export const updateLogEn: FullLocaleMessages['updateLog'] = {
  title: 'Release history',
  helpAbout: 'Help',
  currentTitle: 'Current version',
  currentVersion,
  currentDate: 'Updated 2026.11.04',
  currentItems: [
    {
      title: 'New automatic backups on desktop.',
      text: 'To better protect your data, we strongly recommend enabling automatic backups on desktop! A new Auto backup button at the top lets you save outfit codes, home schemes, and camera parameter favorites to a folder on your own computer. Enable each module separately. Changes are backed up incrementally, and you can restore data from the backup folder to reduce the risk of losing browser data. Important: automatic backups are stored locally on your computer and are not uploaded to the cloud.'
    },
    {
      title: 'Improved interface animations and visuals.',
      text: 'Refined card, dialog, and interaction animations for smoother transitions, clearer feedback, and a more comfortable overall experience.'
    }
  ],
  historyTitle: 'Previous releases',
  history: [
    {
      version: 'v2.5',
      date: '2026.11.03',
      items: [
        {
          title: 'Open Nikki Toolkit from your home screen or desktop. ',
          text: 'Choose More → Install app and follow the prompts to add Nikki Toolkit to your home screen or desktop. Select its icon to open it. Supported browsers can run it in a separate window.'
        },
        {
          title: 'New outfit summary. ',
          text: 'See your most-used tags, clothing and makeup. Filter by part or select a tag to see matching outfits. The summary loads results saved on your device first. You can decode the remaining outfit codes in one go.'
        },
        {
          title: 'Clearer share image previews. ',
          text: 'Share image previews now use the same styling as the large-image viewer, making images easier to see.'
        },
        {
          title: 'Save an outfit with just a code. ',
          text: 'Enter an outfit code or add a photo to save a new outfit. Photo-only outfits appear under Pending so you can add a code later.'
        }
      ]
    },
    {
      version: 'v2.4',
      date: '2026.11.01',
      items: [
        {
          title: 'New share images for photos and outfit codes.',
          text: 'Open Share from a photo card or the parameter window and choose whether to include photo parameters, outfit parts, and the camera parameter code. Outfit cards and parsing windows can also generate a 9:16 portrait share card with the outfit image and code.'
        },
        {
          title: 'Additional photo parameter details.',
          text: 'Added a separate zoom value and animation playback progress for photos taken after game version 2.11. Weather details now include wind strength and direction, such as Sunny, Light wind, South.'
        },
        {
          title: 'Improved large-image preview layout and interactions.',
          text: 'Images make fuller use of screen space, with refreshed visual styling.'
        },
        {
          title: 'Large-image previews for camera parameter favorites.',
          text: 'Double-click a card with a cover to preview the image. Zoom, pan, and switch between images, or copy parameters, edit the favorite, and view details directly.'
        },
        {
          title: 'Refined batch action toolbar styling.',
          text: 'A compact grouped layout uses text colors to distinguish different actions.'
        },
        {
          title: 'Additional creator profile links.',
          text: 'Added a Bilibili profile link to the More menu and updated the Douyin profile link.'
        }
      ]
    },
    {
      version: 'v2.3',
      date: '2026.10.30',
      items: [
        {
          title: 'Decode outfits from your photos!',
          text: 'Decode an original game photo to see both camera settings and outfit pieces. Select a piece to view its outfit, evolution form, dyeing requirements and applied dyes, making it easier to recreate your favorite looks.'
        },
        {
          title: 'Two layouts for photo decoding.',
          text: 'On desktop, switch between stacked and side-by-side layouts and save your preference. Mobile uses a stacked layout automatically. Improved proportions, backgrounds and scrolling make settings and outfits easier to compare.'
        },
        {
          title: 'Group evolution forms in your wardrobe.',
          text: 'The new Show evolution forms switch displays every form when enabled, or combines each family into one card when disabled. Your preference is saved, and other forms remain available to expand and view.'
        },
        {
          title: 'Switch forms directly in outfit and piece details.',
          text: 'Browse different forms in the same family and their ownership status from wardrobe and outfit decoding details, without closing the window to search again.'
        },
        {
          title: 'Unified cloud sync for Resonance and Wardrobe.',
          text: 'Manage both modules in one window. Upload, download or delete cloud saves separately or together. Compare local and cloud records, update times, replacement scope and server changes before proceeding.'
        },
        {
          title: 'Clearer cloud messages and better save protection.',
          text: 'If local or cloud records change, you will be asked to confirm again to avoid overwriting recent updates. Improved protection for existing records when sync fails, with clearer messages when a module encounters a problem.'
        },
        {
          title: 'New Compatibility open (read-only) album mode.',
          text: 'If normal folder authorization fails, try this mode to browse, decode, favorite and export photos, including split ZIP downloads. Photos are read locally without changing originals. Select the folder again after reloading or to view new photos. Editing notes, deleting, restoring and targeted cleanup are unavailable; favorites are saved separately from normal mode.'
        },
        {
          title: 'A lighter, faster start.',
          text: 'Wardrobe, Resonance, camera favorites, decoding tools and catalog content load when needed, reducing the initial wait. Improved cover loading and scrolling for large favorite collections reduce background resource use.'
        },
        {
          title: 'Smoother loading and retries.',
          text: 'Retry pages or windows that fail to load, and cancel imports more smoothly. Fixed issues with opening windows for the first time, reopening them and content appearing again after cancellation.'
        },
        {
          title: 'Easier retries when photo decoding fails.',
          text: 'See decoding progress after entering a UID manually, with clearer failure reasons and easier editing and retries. Added guidance on finding original game photos to help check their source.'
        },
        {
          title: 'Clearer backup import messages.',
          text: 'Get specific guidance for incorrect backup types, oversized files, missing images or damaged backups. Importing a full backup into camera favorites points you to the correct entry. Also improved restore messages and download save buttons.'
        },
        {
          title: 'Review before clearing your data.',
          text: 'Improved the confirmation window to clearly list what will be deleted and kept, with a new shortcut to export a backup first.'
        },
        {
          title: 'Lucky pull times updated for game version 2.11.',
          text: 'Updated recommended dates, times, directions and rankings, with a new Zodiac to avoid column. For entertainment only.'
        },
        {
          title: 'Clearer wardrobe details.',
          text: 'Improved the layout of outfit overviews, collection progress, attributes, versions, descriptions and piece lists. Desktop now shows source labels, with more distinct colors for different information.'
        },
        {
          title: 'More comfortable browsing on mobile.',
          text: 'Improved wardrobe form switching, detail windows and action layouts. Outfit quick navigation on the Resonance page now uses two columns.'
        },
        {
          title: 'Quicker menus and settings.',
          text: 'Desktop top menus open on hover. Theme and language changes apply immediately, with improved switching animations and selection indicators.'
        },
        {
          title: 'Refined light and dark themes and interface details.',
          text: 'Improved colors, corners, shadows and interaction feedback for buttons, menus, tags, inputs, cards and dialogs. Updated camera favorite tags, home information, wardrobe notices, Resonance cards and import text areas for a more consistent appearance, with better display in some older browsers.'
        },
        {
          title: 'Other fixes and improvements.',
          text: 'Fixed decoding issues with some resource data and improved cache clearing and import cancellation.'
        }
      ]
    },
    {
      version: 'v2.2',
      items: [
        {
          title: 'New website icon: ',
          text: 'A transparent pink gift box holds an exquisite dress and starlight, surrounded by ribbons. It symbolizes treasuring every heartwarming moment in Nikki’s world inside a little magic box. Updated the website header, browser tab, and launcher icons.'
        },
        {
          title: 'Wardrobe cloud sync: ',
          text: 'Share an account with resonance records while managing separate cloud saves.'
        },
        {
          title: 'Independent thumbnail sizes: ',
          text: 'Small, medium, and large sizes are now available for albums, outfit codes, home schemes, and camera parameters. Set image ratio and size independently.'
        },
        {
          title: 'Improved photo parsing: ',
          text: 'Automatic parsing progress now appears at the top. Reduced repeated parsing of failed photos and added retries, original-photo guidance, and clearer errors.'
        },
        {
          title: 'Improved menus and animations: ',
          text: 'Added a Cloud menu for resonance records and wardrobe on desktop, expand and collapse animations for the date tree, and improvements to iOS server selection and keyboard controls.'
        },
        {
          title: 'Error diagnostics: ',
          text: 'Improved error tracking across modules and cloud services to help identify problems.'
        },
        {
          title: 'Fixes and maintenance: ',
          text: 'Fixed the home scheme editor closing after saving and long tags wrapping. Improved small camera thumbnails and favorite button styling.'
        }
      ]
    },
    {
      version: 'v2.1.2',
      items: [
        {
          title: 'Global server resonance and wardrobe imports:',
          text: 'Choose the China server or the Global Asia, America, Europe, or Taiwan/Hong Kong/Macao server. The sign-in link follows the selected server, and the import preview shows the server and UID.'
        },
        {
          title: 'Feedback from Global server players:',
          text: 'The developer does not currently have a Global server account and cannot conduct comprehensive hands-on testing. If you encounter import failures, incorrect data displays, or other issues on a Global server, please report them to the developer on Xiaohongshu to help improve Global server support.'
        }
      ]
    },
    {
      version: 'v2.1.1',
      items: [
        {
          title: 'Video tutorials for importing resonance records and wardrobe data: ',
          text: 'Under “Get sign-in credentials”, click Desktop, Android, or iOS to view the corresponding tutorial on Xiaohongshu.'
        },
        {
          title: 'Archive import progress: ',
          text: 'See the current stage, including fetching data, checking its format, parsing wardrobe and resonance records, and preparing the preview.'
        },
        {
          title: 'Fixed image import and saving: ',
          text: 'Improved compatibility when reading, previewing, and saving various image formats, fixing cases where selected images could not be saved.'
        },
        {
          title: 'Improved resonance images: ',
          text: 'Adjusted outfit and piece image borders and background fill to reduce gaps around the edges.'
        }
      ]
    },
    {
      version: 'v2.1',
      items: [
        {
          title: 'Personal Wardrobe is now available: ',
          text: 'Filter by ownership, rarity, evolution stage, game version, style, source, tag, and category.'
        },
        {
          title: 'Wardrobe details: ',
          text: 'Click an outfit card to view collection progress, rarity, style, release version, description, and pieces. Click a piece card to open its details.'
        },
        {
          title: 'Details from resonance records: ',
          text: 'Click an outfit image to open outfit details, or a piece image in a record to open piece details.'
        },
        {
          title: 'Outfit details from outfit-code decoding: ',
          text: 'Click a piece image in the decoding results, then click the link icon next to its outfit name to open outfit details.'
        },
        {
          title: 'Improved ownership recognition: ',
          text: 'Use resonance records to supplement ownership for some clothing. Unrecognized pieces from Starlit Shop, clothing shops, Mira Crown, Surprise-O-Matic, and world quests show as Unknown. Selecting these sources automatically selects Unknown and displays an explanation.'
        },
        {
          title: 'Improved resonance layout: ',
          text: 'Refined outfit names, rarity, total pulls, and average pulls. On mobile, first/second set buttons are stacked in the top-right corner to save space.'
        },
        {
          title: 'Improved operation notices: ',
          text: 'Multiple notices can appear together during consecutive operations.'
        },
        {
          title: 'Renamed navigation: ',
          text: 'Resonance is now Nikki Archive, containing Resonance Records and Personal Wardrobe.'
        },
        {
          title: 'Wardrobe interface previews: ',
          text: 'View the screenshots on Xiaohongshu. ',
          link: {
            label: 'Open Xiaohongshu',
            href: 'https://www.xiaohongshu.com/discovery/item/6ad4765c0000000028002402?source=webshare&xhsshare=pc_web&xsec_token=ABjeDe5Todarh39N7ZgKZAUc-FyPIeTAKg25qOtcSrOI0=&xsec_source=pc_share'
          }
        }
      ]
    },
    {
      version: 'v2.0.2',
      items: [
        {
          title: 'Upgraded resonance record display: ',
          text: 'on desktop, the first and second set pieces are shown together without switching; on mobile, a small character art with a full-width piece grid lets you switch sets to view acquisition progress, recorded pulls for the current set, and average pulls per known piece, while keeping the combined total and average pulls for both sets.'
        },
        {
          title: 'Added illustration images to empty mobile pages: ',
          text: 'Outfit Codes, Home Schemes, Camera Parameters, and Resonance Records now show their corresponding UI illustration when there is no data yet.'
        },
        {
          title: 'Improved mobile image-upload compatibility: ',
          text: 'refined the read, preview, and save flow for outfit images and camera-parameter favorite covers, fixing an error that prevented saving after picking an image.'
        }
      ]
    },
    {
      version: 'v2.0.1',
      items: [
        {
          title: 'Added resonance cloud sync: ',
          text: 'register and sign in to an account, manually upload your resonance records, and download them on another computer or phone signed in to the same account for cross-device syncing. Each account keeps one cloud save; uploading fully overwrites the cloud copy and downloading fully overwrites the local copy, so check the account and record count before confirming. Sign-in and local changes do not sync automatically.'
        },
        {
          title: 'Manage cloud saves: ',
          text: 'after signing in, you can confirm the deletion of the cloud resonance save while keeping your account, sign-in status, and local records.'
        },
        {
          title: 'Adjusted resonance import: ',
          text: 'when importing from Pear-Pal or a JSON file, confirming replaces all local resonance records with the previewed results.'
        },
        {
          title: '"Clear data" can now fully reset the site: ',
          text: 'after confirmation it clears schemes, photos, tags, resonance records, favorites, and settings in the current browser, then reloads to the initial state. This cannot be undone—export a backup first; original files on your computer and cloud saves are kept.'
        },
        {
          title: 'Polished the logic and experience, and took Momo out for a big meal 🍟🍔🍕🍝🍩',
          text: ''
        }
      ]
    },
    {
      version: 'v2.0',
      items: [
        {
          title: 'The mobile web version is officially live with a full interface upgrade!',
          text: ' You can now manage outfit codes, home schemes, camera-parameter favorites, and resonance records directly in your mobile browser—view, organize, and share your game inspirations anytime. Added a bottom four-module navigation and redesigned the top toolbar, cards, and action layouts to better suit mobile browsing and touch use.'
        },
        {
          title: 'Existing desktop data can be transferred to your phone: ',
          text: 'on desktop, choose Export all data from the More menu, send the generated ZIP to your phone, open the site in your mobile browser, and choose Import all data from the More menu to migrate outfit codes, home schemes, camera-parameter favorites, and resonance records.'
        },
        {
          title: 'Improved mobile search and filtering: ',
          text: 'the magnifier at the top searches the current module; the tag window supports search, adding, and drag-to-reorder, and resonance filters consolidate banner sorting, star-rating filters, and quick outfit navigation.'
        },
        {
          title: 'Improved cards and batch operations: ',
          text: 'common actions are now placed at the bottom of each card for easy copy, edit, delete, and decode.'
        },
        {
          title: 'Improved preview and editing: ',
          text: 'support one-finger swipe paging, pinch-to-zoom, and panning while zoomed; improved dialog layouts, input areas, and on-screen keyboard avoidance, and unified transition animations and press feedback.'
        },
        {
          title: 'Updated help and interface details: ',
          text: 'mobile and desktop each show their corresponding Chinese/English help, with improved typography, display, view settings, and layout.'
        }
      ]
    },
    {
      version: 'v1.8.2',
      items: [
        {
          title:
            'Outfit codes and home schemes are now stored in the browser and shared across all albums instead of the selected album folder.',
          text: ' Old data is migrated automatically when you enter the page, and the old folder is removed after a successful migration.'
        },
        {
          title: 'Added Export all data / Import all data: ',
          text: 'from the More menu, bundle outfit codes, home schemes, camera favorites, and resonance records into a single all-data ZIP backup.'
        },
        {
          title: 'Supports cross-device transfer: ',
          text: 'export all data on your computer and send the ZIP to your phone, then open the site on your phone to import the data and use every module except the album normally.'
        },
        {
          title: 'Auto-update for outfit codes improved: ',
          text: 'authorize the X6Game folder to use auto-update without selecting an album first.'
        },
        {
          title: 'Interface and experience polish: ',
          text: 'refined related page details.'
        }
      ]
    },
    {
      version: 'v1.8.1',
      items: [
        {
          title: 'Added camera-parameter favorites: ',
          text: 'Favorites is now split into "Camera Parameters" and "Photo Favorites". Save directly from the photo-parameter decoding window, or enter a camera-parameter code to decode and save automatically.'
        },
        {
          title:
            'Supports custom names, single-tag categories, tag sorting and search, plus parameter copying, editing, detail viewing, and batch deletion.',
          text: ''
        },
        {
          title:
            'Supports uploading or replacing a favorite cover image, automatically converted to WebP on save.',
          text: ''
        },
        {
          title: 'Supports ZIP backup import and export for camera-parameter favorites.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.8',
      items: [
        {
          title: 'Added Resonance Records: ',
          text: 'import resonance records from Pear-Pal, with instructions for obtaining sign-in credentials and a preview before saving. After obtaining the sign-in cookie credentials on a computer, send them to your phone and enter them on the website in your mobile browser to view resonance records.'
        },
        {
          title: 'Added resonance data import and export: ',
          text: 'supports old and new Resonance Recorder JSON files and exports backups for this app; importing updates matching outfit records while keeping other local records.'
        },
        {
          title: 'View outfit acquisition details: ',
          text: 'check piece pull counts for the first and second sets, plus total and average pulls for each outfit; pieces are displayed in acquisition order, with support for manual edit markers in imported files.'
        },
        {
          title: 'Added quick navigation, sorting, and filtering: ',
          text: 'use the sidebar to jump to an outfit, sort banners newest or oldest first, and filter 5-star or 4-star records.'
        },
        {
          title: 'Cloud sync, wardrobe data, and more features are in development.',
          text: ' Stay tuned!'
        }
      ]
    },
    {
      version: 'v1.7.1',
      items: [
        {
          title: 'Added a "Capture Actions" view to the album sidebar: ',
          text: 'after turning on "Auto-parse actions", each photo\'s pose is detected automatically and photos are grouped by action, with sorting by action ID (newest first), name, photo count, or latest capture time; photos with no action and unparsed photos form separate groups. The switch is off by default—turn it on as needed, since parsing many photos may slow down the page.'
        },
        {
          title:
            'Action results are cached locally in the browser, so reopening an album does not reparse every photo; "Clear cache" and "Clear all data" also clear the photo-action parse cache.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.7',
      items: [
        {
          title: 'Added a Home schemes management module: ',
          text: 'add home codes and combo codes, and entering a scheme code automatically parses the scheme name, type, version, furniture count, and other information.'
        },
        {
          title:
            'Added ZIP backup import and export for home schemes; exported files are placed in the currently selected album folder.',
          text: ''
        },
        {
          title: '"Clear cache" now clears the outfit-code and home-scheme parsing caches.',
          text: ''
        },
        {
          title: 'Polished the experience, including tag-button animations and loading hints.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6.3',
      items: [
        {
          title: 'Outfit-code decoding now labels clothing-part types: ',
          text: 'the part type (hairstyle, hair accessory, eyelashes, etc.) is shown after the part name for quick identification.'
        },
        {
          title: 'Added clickable part details: ',
          text: 'click a part image in the decoding results to view the current part, its outfit set and set image, evolution/refinement status, and dyeing conditions; when dyeing data is available, the region, dye palette, color number, and color are also displayed.'
        },
        {
          title:
            'The NikkiCube official website is now live, and I took Nikki along to take a look 🤩',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6.2',
      items: [
        {
          title: 'Added local photo parameter decoding: ',
          text: 'select game original photos on your computer or phone in the toolbar decoding window to analyze shooting parameters. The feature is also available on mobile; when decoding on mobile, you must manually enter the UID of the account used to take the photo.'
        },
        {
          title: 'Upgraded the brand name to "NikkiCube / 暖立方".',
          text: ' NikkiCube Nikki³ | A place for every heart-flutter — the official theme website is coming soon ✨'
        },
        {
          title: 'Updated the outfit-code decoding gallery to version 2.10.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6.1',
      items: [
        {
          title: 'Added deletion of the matching low-quality images for selected photos: ',
          text: "images are matched by name and permanently deleted from the current account's ScreenShot and NikkiPhotos_LowQuality folders, while the original photos in the album are kept."
        },
        {
          title:
            'Redesigned the Release history window and reorganized how releases are presented.',
          text: ''
        },
        {
          title: 'Fixed various issues and went to see a movie with Nikki 💅.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.6',
      items: [
        {
          title:
            'Added photo parameter decoding from photo thumbnails, the large-preview toolbar, or the Tools menu.',
          text: ' Results include camera, environment, scene, pose, lighting, and filter parameters, and camera parameters can be copied for one-click import into the game.'
        },
        {
          title:
            'Added a Tools menu that centralizes targeted cleanup, lucky pull times, and parameter/outfit-code decoding.',
          text: ''
        },
        {
          title: 'Updated lucky pull times to version 2.10 content.',
          text: ''
        },
        {
          title:
            'Mobile web access cannot manage albums, but camera-parameter and outfit-code decoding are available from the Tools menu.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.5',
      items: [
        {
          title: 'Added outfit-code decoding: ',
          text: 'the Outfit Code page now provides a direct input and decode entry, and outfit cards now have a decode button in the upper-right corner.'
        },
        {
          title: 'Added homepage likes.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.4.1',
      items: [
        {
          title: 'Removed the X6Game album-location restriction.',
          text: ''
        },
        {
          title: 'Added batch album photo import and export.',
          text: ''
        },
        {
          title: 'The selection bar can export selected photos.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.4',
      items: [
        {
          title: 'Added batch album photo import and export.',
          text: ''
        },
        {
          title: 'Cancelling an export keeps completed target files and source photos.',
          text: ''
        },
        {
          title:
            'After a completed export, successfully exported source photos can be moved to Recently Deleted.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.3',
      items: [
        {
          title: 'Added the 2.9 lucky pull times module.',
          text: ''
        },
        {
          title:
            'Improved ZIP transfer, image processing, deletion, recovery, and cleanup performance.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.2',
      items: [
        {
          title: 'Added notes for photos and outfit codes.',
          text: ''
        },
        {
          title: 'Added filename, outfit-code, and note search.',
          text: ''
        },
        {
          title:
            'Improved ZIP transfer, image processing, deletion, recovery, and cleanup performance.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.1',
      items: [
        {
          title:
            'Use the image modification time when the filename does not contain a readable capture time.',
          text: ''
        },
        {
          title: 'Added the release history entry.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.0 Supplement',
      items: [
        {
          title:
            'Added targeted cleanup for low-quality photos, screenshots, crash snapshots, runtime logs, and web cache.',
          text: ''
        },
        {
          title: 'Added the feedback entry.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.3.0',
      items: [
        {
          title:
            'Added targeted cleanup for low-quality photos, screenshots, crash snapshots, runtime logs, and web cache.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2.3',
      items: [
        {
          title: 'New outfit tags appear first and can be reordered by dragging.',
          text: ''
        },
        {
          title: 'Polished animations and interaction details.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2.2',
      items: [
        {
          title: 'Improved outfit-code import and export performance.',
          text: ''
        },
        {
          title: 'Improved X6Game authorization and cleanup.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2.1',
      items: [
        {
          title: 'Added quick tag creation to the outfit editor.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.2',
      items: [
        {
          title: 'Added the Starry Gallery outfit-code management module.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.1.1',
      items: [
        {
          title: 'Polished CSS, layout, and visual presentation.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.1',
      items: [
        {
          title: 'Reorganized the interface for clearer structure and interaction logic.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.0.2',
      items: [
        {
          title: 'Added All photos, Favorites, and Recently Deleted views.',
          text: ''
        },
        {
          title: 'Added trash, preview, restore, and permanent deletion workflows.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.0.1',
      items: [
        {
          title: 'Added lazy loading to reduce high-resolution photo lag.',
          text: ''
        }
      ]
    },
    {
      version: 'v1.0.0',
      items: [
        {
          title: 'Initial release: ',
          text: 'date-based photo browsing, Favorites, full-screen preview, keyboard controls, thumbnail ratios, and targeted cleanup.'
        }
      ]
    }
  ],
  dontShowAgain: "Don't show again for this version",
  confirm: 'Got it',
  closeAria: 'Close release history'
}
