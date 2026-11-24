export const helpTaskOrder = [
  'album',
  'save',
  'camera',
  'archive',
  'backup',
  'tools',
  'install'
] as const
export type HelpTaskId = (typeof helpTaskOrder)[number]

type HelpLayout = 'desktop' | 'mobile'
export type HelpLayoutText = string | Record<HelpLayout, string>

type HelpOperation = {
  input: string | readonly string[]
  result: string
  joiner?: '+'
}
type HelpOperationGroup = {
  kind: 'mouse' | 'keyboard' | 'touch'
  title: string
  rows: readonly HelpOperation[]
}
type HelpTask = {
  title: string
  entry: HelpLayoutText
  steps: readonly HelpLayoutText[]
}

export type HelpAboutMessages = {
  title: string
  closeAria: string
  tasksTitle: string
  operations: Record<HelpLayout, readonly HelpOperationGroup[]>
  tasks: Record<HelpTaskId, HelpTask>
}

export const helpAboutZh: HelpAboutMessages = {
  title: '使用帮助',
  closeAria: '关闭使用帮助',
  tasksTitle: '我想……',
  operations: {
    desktop: [
      {
        kind: 'mouse',
        title: '鼠标操作',
        rows: [
          { input: '单击图片', result: '查看大图' },
          { input: '点图片右下角圆圈', result: '选中或取消选中' },
          { input: '大图中用滚轮', result: '放大或缩小' },
          { input: '放大后拖动图片', result: '查看细节' }
        ]
      },
      {
        kind: 'keyboard',
        title: '快捷键',
        rows: [
          { input: ['←', '→'], result: '大图中切换上一张或下一张' },
          { input: ['Esc'], result: '关闭当前预览或弹窗' },
          { input: ['Enter'], result: '用 Tab 移到图片卡片后，查看大图' },
          { input: ['空格'], result: '用 Tab 移到图片卡片后，切换选中状态' },
          { input: ['Ctrl', 'V'], joiner: '+', result: '在搭配编辑窗口粘贴图片' },
          {
            input: ['Delete'],
            result: '在支持删除的照片预览中移到「最近删除」。已在「最近删除」时，弹出永久删除确认。'
          }
        ]
      }
    ],
    mobile: [
      {
        kind: 'touch',
        title: '手势操作',
        rows: [
          { input: '点图片', result: '查看大图' },
          { input: '长按图片或点圆圈', result: '选中或取消选中，选好后用底栏批量操作' },
          { input: '大图未放大时左右滑', result: '切换上一张或下一张' },
          { input: '双指捏合或张开', result: '缩小或放大图片' },
          { input: '放大后单指拖动', result: '查看细节' }
        ]
      }
    ]
  },
  tasks: {
    album: {
      title: '打开游戏相册',
      entry: '当前相册 → 授权X6Game',
      steps: [
        '选择 X6Game 后会自动打开第一个相册。有多个账号时，可在「我的相册」标题旁切换。照片在浏览器本地读取。',
        '打不开时，在「当前相册」试试「兼容打开（只读）」。',
        '普通删除可从「最近删除」恢复。永久删除和「工具 → 专项清理」会直接删除电脑文件。'
      ]
    },
    save: {
      title: '保存搭配码或家园方案',
      entry: {
        desktop: '左侧导航 → 搭配码或家园方案 → 添加方案',
        mobile: '底部导航 → 搭配码或家园方案 → +'
      },
      steps: [
        '搭配码和图片任选一项即可保存。只有图片可在「待填写」补码，有图有码可在卡片上导出分享图。',
        '输入家园码或组合码，按解析结果保存方案。',
        {
          desktop: '点搭配码页的「搭配总结」，查看收藏趋势和标签分布。',
          mobile: '在搭配码页点「⋯ → 搭配总结」，查看收藏趋势和标签分布。'
        }
      ]
    },
    camera: {
      title: '解析照片或收藏相机参数',
      entry: '工具 → 参数/搭配码解析',
      steps: [
        '选择游戏原图。若提示填写 UID，请使用拍这张照片的游戏账号 UID。',
        '解析后可以收藏相机参数。',
        {
          desktop: '已有参数码可从「相机参数 → 添加收藏」直接添加。',
          mobile: '已有参数码可在底部导航进入「相机参数」，点「+」直接添加。'
        }
      ]
    },
    archive: {
      title: '导入共鸣和衣橱、查图鉴',
      entry: {
        desktop: '左侧导航 → 暖暖档案 → 共鸣记录或个人衣橱 → 导入数据',
        mobile: '底部导航 → 暖暖档案 → 共鸣记录或个人衣橱 → +'
      },
      steps: [
        '从美鸭梨或文件导入。核对区服和预览，确认后会覆盖所选项目的旧记录。',
        '妆容图鉴和满进动画可在「暖暖档案」直接浏览。'
      ]
    },
    backup: {
      title: '备份、换设备或清理数据',
      entry: '更多 → 数据备份',
      steps: [
        {
          desktop: '换设备时先「导出全部数据」，再到新设备「导入全部数据」。游戏原图需另存。',
          mobile: '换设备时先「导出全部数据」，再到新设备「导入全部数据」。游戏原图需另存。'
        },
        {
          desktop:
            '在共鸣或衣橱页面打开「云端」登录。上传覆盖所选云端存档，从云端同步覆盖所选本机记录。',
          mobile:
            '在共鸣或衣橱页面点「⋯ → 登录」。登录后同一菜单中的「上传云端」覆盖所选云端存档，「从云端同步」覆盖所选本机记录。'
        },
        '「更多 → 应用维护」中，「清除缓存」只移除解析缓存。「清除数据」会永久删除此浏览器里的记录和设置，请先备份。'
      ]
    },
    tools: {
      title: '找其他工具或调整界面',
      entry: '顶部 → 工具或视图',
      steps: [
        '在「工具」打开「头像模拟器」，给照片试戴头像框并保存。「抽卡吉时」也在这里。',
        {
          desktop: '在「视图」切换主题、语言和风格，也可调整当前页面的显示选项。',
          mobile: '在「视图」切换主题、语言和风格。「导航栏样式」可切换贴底或悬浮胶囊。'
        }
      ]
    },
    install: {
      title: '安装应用',
      entry: '更多 → 应用维护 → 安装应用',
      steps: [
        {
          desktop: '按提示将暖立方添加到电脑桌面，以后点图标就能打开。',
          mobile: '按提示将暖立方添加到手机主屏幕，以后点图标就能打开。'
        }
      ]
    }
  }
}

export const helpAboutEn: HelpAboutMessages = {
  title: 'Help',
  closeAria: 'Close help',
  tasksTitle: 'I want to…',
  operations: {
    desktop: [
      {
        kind: 'mouse',
        title: 'Mouse controls',
        rows: [
          { input: 'Click an image', result: 'Open the preview' },
          { input: 'Click the bottom-right circle', result: 'Select or deselect the image' },
          { input: 'Scroll over the preview', result: 'Zoom in or out' },
          { input: 'Drag after zooming in', result: 'Pan to see details' }
        ]
      },
      {
        kind: 'keyboard',
        title: 'Keyboard shortcuts',
        rows: [
          { input: ['←', '→'], result: 'Show the previous or next image in the preview' },
          { input: ['Esc'], result: 'Close the current preview or dialog' },
          { input: ['Enter'], result: 'Tab to an image card, then open its preview' },
          { input: ['Space'], result: 'Tab to an image card, then toggle selection' },
          { input: ['Ctrl', 'V'], joiner: '+', result: 'Paste an image in the outfit editor' },
          {
            input: ['Delete'],
            result:
              'In a photo preview that allows deletion, move the photo to Recently deleted. From there, open the permanent deletion prompt.'
          }
        ]
      }
    ],
    mobile: [
      {
        kind: 'touch',
        title: 'Touch gestures',
        rows: [
          { input: 'Tap an image', result: 'Open the preview' },
          {
            input: 'Hold the image or tap its circle',
            result: 'Toggle selection, then use the bottom bar for bulk actions'
          },
          {
            input: 'Swipe left or right before zooming in',
            result: 'Show the previous or next image'
          },
          { input: 'Pinch in or spread two fingers', result: 'Zoom out or in' },
          { input: 'Drag with one finger after zooming in', result: 'Pan to see details' }
        ]
      }
    ]
  },
  tasks: {
    album: {
      title: 'Open my game album',
      entry: 'Current album → Authorize X6Game',
      steps: [
        'Select X6Game to open the first album. If there are several accounts, switch from the My album heading. Your browser reads the photos locally.',
        'If the folder won’t open, try “Compatibility open (read-only)” under Current album.',
        'Recover deleted photos from Recently deleted. Permanent deletion and Tools → Cleanup delete files from your computer.'
      ]
    },
    save: {
      title: 'Save an outfit or home scheme',
      entry: {
        desktop: 'Left navigation → Outfit codes (Add outfit) or Home schemes (Add scheme)',
        mobile: 'Bottom navigation → Outfit codes or Home schemes → +'
      },
      steps: [
        'Save an outfit with a code or an image. Add codes to image-only outfits under Pending. Cards with both can export a share image.',
        'For a home scheme, enter a home or combo code, then save the decoded scheme.',
        {
          desktop:
            'Open Outfit summary on the Outfit codes page to see save history and tag distribution.',
          mobile:
            'On the Outfit codes page, open ⋯ → Outfit summary to see save history and tag distribution.'
        }
      ]
    },
    camera: {
      title: 'Decode a photo or save camera parameters',
      entry: 'Tools → Parameter / outfit-code parser',
      steps: [
        'Choose an original game photo. If asked for a UID, enter the game account UID used to take it.',
        'Save camera parameters from the results.',
        {
          desktop: 'If you have a code, use Camera parameters → Add favorite.',
          mobile: 'If you have a code, open Camera parameters in the bottom navigation and tap +.'
        }
      ]
    },
    archive: {
      title: 'Import records or browse the catalog',
      entry: {
        desktop:
          'Left navigation → Nikki Archive → Resonance records or Personal wardrobe → Import data',
        mobile: 'Bottom navigation → Nikki Archive → Resonance records or Personal wardrobe → +'
      },
      steps: [
        'Import from Pear-Pal or a file. Check the server and preview. Confirming replaces the existing records for the selected modules.',
        'Browse the Makeup catalog and Evolution animations directly from Nikki Archive.'
      ]
    },
    backup: {
      title: 'Back up, switch devices, or clear data',
      entry: 'More → Data backup',
      steps: [
        {
          desktop:
            'Choose “Export all data”, then “Import all data” on the new device. Back up original game photos separately.',
          mobile:
            'Use “Export all data” to save a backup, then choose “Import all data” on the new device. Back up original game photos separately.'
        },
        {
          desktop:
            'Open Cloud in Resonance records or Personal wardrobe to log in. Upload to cloud replaces the selected cloud saves. Sync from cloud replaces the selected local records.',
          mobile:
            'From Resonance records or Personal wardrobe, choose ⋯ → Log in. In the same menu, Upload to cloud replaces selected cloud saves and Sync from cloud replaces selected local records.'
        },
        'In More → App maintenance, “Clear cache” removes cached decoding results. “Clear data” permanently deletes records and settings in this browser. Back up first.'
      ]
    },
    tools: {
      title: 'Find other tools or change the display',
      entry: 'Header → Tools or View',
      steps: [
        'In Tools, open Avatar simulator to try frames on a photo and save it. Lucky pull times are in the same menu.',
        {
          desktop:
            'In View, change the theme, language, material style, or display options for the current page.',
          mobile:
            'In View, change the theme, language, or material style. Use Navigation style to switch between Docked and Floating capsule.'
        }
      ]
    },
    install: {
      title: 'Install the app',
      entry: 'More → App maintenance → Install app',
      steps: [
        {
          desktop:
            'Follow the instructions to add NikkiCube to your desktop, then click its icon to open it.',
          mobile:
            'Follow the instructions to add NikkiCube to your home screen, then tap its icon to open it.'
        }
      ]
    }
  }
}
