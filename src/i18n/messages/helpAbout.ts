// 使用帮助：共享介绍与窗口文案，电脑和手机分别提供与当前界面一致的教程。
import type { HelpAboutDeviceContent, FullLocaleMessages } from '../types'

const sharedNotesZh = [
  '把暖立方添加到手机或电脑桌面，点图标即可打开。在支持的浏览器中，这个轻量网页应用会像独立应用一样打开，隐藏浏览器地址栏和工具栏。具体步骤见暖立方的「更多 → 安装应用」。',
  '方案、相机参数收藏、共鸣记录和设置保存在当前浏览器中。共鸣与衣橱可在同一窗口勾选后手动上传云端，在其他设备登录同一账号后下载；登录和本地修改不会自动同步。其他模块跨设备迁移仍使用备份，清理浏览器站点数据前请先备份或上传最新共鸣与衣橱记录。',
  '“清除缓存”只清理解析缓存；“清除数据”永久删除当前浏览器中的全部方案、图片、标签、共鸣记录、收藏、UID、目录授权、迁移记录和设置，并重新加载回到初始状态。清除数据前请导出备份；云端账号和存档保留，该操作不会主动退出云端登录。两项操作都不会删除电脑中的原始照片、游戏文件和已导出的备份。',
  '共鸣与衣橱共用账号和同步窗口，可勾选后一起上传、下载或删除云端存档。上传以所选本机完整存档覆盖云端，下载反向覆盖；请核对账号、数量和衣橱区服。所选模块共同提交，冲突需重新预览。云端无存档不清空本机；有效的 0 件衣橱可覆盖目标。清空本机不删除云端，删除云端需明确勾选范围，账号和本机记录保留。',
  '全部数据 ZIP 只备份当前浏览器中的记录，不包含云端账号、密码或登录状态；导入 ZIP 不会更新云端。需要备份最新云端记录时，先从云端同步再导出。',
  '删除方案或参数收藏前会要求确认；已删除的记录不能直接恢复，请用备份恢复需要保留的数据。',
  '美鸭梨导入凭据用于获取游戏记录，与本站云同步账号密码不同。凭据失效时按导入窗口提示重新获取；两类凭据都请妥善保管。云同步账号名为 4～32 位英文字母、数字或下划线，不区分大小写，密码为 6～128 个字符；不提供密码修改或找回。'
]
const sharedNotesEn = [
  'Add Nikki Toolkit to your home screen or desktop to open it from its icon. In supported browsers, the website opens like a separate app without the browser address bar or toolbars. See More → Install app in Nikki Toolkit for instructions.',
  'Schemes, camera favorites, resonance records and settings are stored in the current browser. Manually upload resonance and wardrobe together from the shared sync dialog, then sign in to the same account on another device and download them. Login and local edits do not sync automatically. Other collections use backup files for migration; back up or upload your latest resonance and wardrobe records before clearing browser site data.',
  'Clear cache only removes parse caches. Clear data permanently deletes all schemes, images, tags, resonance records, favorites, UIDs, directory authorizations, migration records and settings in this browser, then reloads to the initial state. Export a backup first. Cloud accounts and saves remain; this action does not sign you out of cloud sync. Neither action deletes original photos, game files or exported backups on your computer.',
  'Resonance and wardrobe share an account and one sync dialog. Select modules to upload, download or delete together. Complete selected saves replace their destinations; check the account, counts and wardrobe region. Selected modules commit together; conflicts require a new preview. Missing cloud saves never clear local data; a valid zero-piece wardrobe can replace its destination. Deletion requires explicit selection and preserves your account and local records.',
  'A full-data ZIP backs up records in this browser, without cloud accounts, passwords or login sessions. Importing a ZIP does not update the cloud. Download the latest cloud records before exporting if needed.',
  'Deleting a scheme or camera favorite requires confirmation. Deleted records cannot be restored directly; use a backup to recover data you need to keep.',
  'Pear-Pal import credentials fetch game records and are separate from your cloud-sync username and password. Obtain fresh import credentials when prompted; keep both types private. Cloud usernames use 4–32 ASCII letters, digits or underscores, case-insensitive; passwords use 6–128 characters. Password changes and recovery are unavailable.'
]

const desktopZh: HelpAboutDeviceContent = {
  features: [
    {
      icon: 'images',
      title: '相册管理',
      text: '按日期或动作整理游戏照片，支持大图、收藏、备注、参数解析和最近删除。'
    },
    {
      icon: 'outfit',
      title: '搭配码',
      text: '保存搭配图片、搭配码和标签；授权游戏目录后可读取游戏内新增搭配。'
    },
    { icon: 'home', title: '家园方案', text: '管理家园码和组合码，保存名称、封面、备注和标签。' },
    {
      icon: 'camera',
      title: '相机参数',
      text: '解析参数码或原始照片，查看解析结果并保存相机参数收藏。'
    },
    {
      icon: 'resonance',
      title: '共鸣记录',
      text: '导入、预览和保存记录，查看两套抽数；支持账号登录和共鸣记录跨设备云同步。'
    },
    {
      icon: 'backup',
      title: '数据备份',
      text: '各模块可导入导出；顶部“更多”提供全部数据 ZIP，便于跨设备迁移。'
    },
    {
      icon: 'cleanup',
      title: '专项清理',
      text: '授权游戏目录后，按项目和账号清理照片、截图、日志等文件。'
    },
    {
      icon: 'tools',
      title: '搜索与工具',
      text: '搜索当前模块，在视图菜单调整显示、主题和语言，在工具菜单打开参数解析或抽卡吉时。'
    }
  ],
  tutorialSections: [
    {
      title: '首次使用与导航',
      items: [
        '通过左侧导航进入相册、搭配码、家园方案、收藏夹或共鸣。搭配、家园、相机收藏和共鸣可独立使用，不必先选择相册。',
        '浏览游戏相册时选择 NikkiPhotos_HighQuality 文件夹；需要游戏搭配同步、完整照片参数或专项清理时，再按提示授权 X6Game。',
        '顶部搜索作用于当前模块；“视图”设置缩略图、主题和语言，“工具”提供解析及辅助功能，“更多”提供备份与帮助。'
      ]
    },
    {
      title: '照片浏览与操作',
      items: [
        '选择相册后，使用左侧日期或动作索引定位照片，也可进入照片收藏和最近删除。',
        '单击卡片选择照片，双击打开大图；照片卡片和大图工具栏提供收藏、备注及参数解析。',
        '大图支持切换、缩放和拖动；普通删除进入最近删除，可恢复，永久删除和专项清理会修改真实文件。'
      ]
    },
    {
      title: '搭配码管理',
      items: [
        '点击“添加方案”，选择、拖拽或粘贴图片，填写搭配码、备注及一个标签；搭配码可留空，方案会归入待填写。',
        '卡片底部提供复制和编辑；悬停卡片可使用右上角删除及解析按钮，无搭配码时复制和解析不可用。双击卡片可看大图。',
        '在左侧选择标签，用添加按钮创建标签，拖动手柄调整顺序；顶部提供本模块 ZIP 导入导出，授权 X6Game 后可更新游戏搭配。'
      ]
    },
    {
      title: '家园方案管理',
      items: [
        '点击“添加方案”，输入家园码或组合码，按解析结果填写名称、封面、备注和标签后保存。',
        '左侧可按家园码、组合码、未分类或标签筛选；卡片提供复制、编辑和删除，双击可打开大图。',
        '顶部导入导出本模块 ZIP 备份；删除标签只移除分类，不会删除方案本身。'
      ]
    },
    {
      title: '相机参数与照片解析',
      items: [
        '在收藏夹切到“相机参数”，添加参数码并成功解析后保存，也可从照片解析结果中收藏。可填写名称、标签和封面。',
        '卡片底部提供复制、编辑和详情，悬停可删除；复制出的参数码可在游戏相机的参数导入入口使用。',
        '“工具”的参数解析窗口支持输入 CameraParams 或上传照片。完整照片需要原始尾部数据和正确 UID，按提示授权目录或输入 UID。相机收藏的图片比例固定，主题和语言仍可切换。'
      ]
    },
    {
      title: '共鸣记录',
      items: [
        '点击“导入数据”，选择奇想手账凭据导入或本地 JSON 文件，先核对预览，再确认保存。',
        '左侧“排序与筛选”可设置最新/最早卡池优先，以及全部、五星或四星；点击套装索引定位对应记录。',
        '记录卡片可切换第一套/第二套部件抽数；操作行提供 JSON 导出、清空本地记录及注册、登录。登录后可上传云端、从云端同步、删除云端存档及退出。'
      ]
    },
    {
      title: '备份与跨设备迁移',
      items: [
        '单个模块的导入导出位于页面操作区；共鸣使用 JSON，搭配、家园和相机收藏使用 ZIP。',
        '共鸣与衣橱可在同一窗口勾选后在源设备上传云端，在另一设备登录同一账号后从云端同步。迁移搭配、家园和相机收藏时，在“更多”导出全部数据 ZIP，传给另一设备后导入；游戏相册原图请另行保存。',
        '导入会校验数据，并按各模块规则合并或处理冲突；重要数据建议先备份，再按提示操作。'
      ]
    },
    {
      title: '专项清理',
      items: [
        '从顶部“工具”进入专项清理，按提示授权 X6Game，选择清理项目和账号范围。',
        '核对文件数量、占用空间和范围后再确认；清理或永久删除的真实文件无法通过本工具恢复。'
      ]
    }
  ],
  notes: [
    ...sharedNotesZh,
    '相册目录授权、游戏目录自动读取和专项清理需要支持目录授权的电脑浏览器，并允许访问相应文件夹。',
    '完整照片参数解析需要原始照片尾部数据；经过裁剪、转存或压缩的图片可能缺少所需数据。'
  ],
  operationSections: [
    {
      icon: 'mouse',
      title: '鼠标操作',
      items: [
        '单击卡片选择，点击操作按钮执行对应功能；搭配、家园及照片卡片可双击打开大图。',
        '悬停可显示卡片的附加操作和信息；标签顺序通过拖拽手柄调整。',
        '大图可用鼠标滚轮缩放，放大后拖动查看细节。'
      ]
    },
    {
      icon: 'keyboard',
      title: '快捷键',
      items: [
        '大图预览中用左右方向键切换，Esc 关闭当前菜单、弹窗或预览。',
        '照片大图中按 Delete 触发删除，最近删除中的照片会触发永久删除；均需按提示确认。',
        '在搭配编辑窗口的非文本输入区域按 Ctrl+V 可粘贴图片。'
      ]
    }
  ]
}

const mobileZh: HelpAboutDeviceContent = {
  features: [
    {
      icon: 'outfit',
      title: '搭配码',
      text: '保存搭配图片、搭配码和标签，通过卡片底部图标复制、编辑、删除或解析。'
    },
    {
      icon: 'home',
      title: '家园方案',
      text: '保存家园码或组合码，在底部图标栏复制、编辑和删除方案。'
    },
    {
      icon: 'camera',
      title: '相机参数',
      text: '添加、解析及收藏参数码，随时复制参数或查看完整解析结果。'
    },
    {
      icon: 'resonance',
      title: '共鸣记录',
      text: '用凭据或 JSON 导入记录，查看两套抽数；登录后可手动上传或从云端同步。'
    },
    {
      icon: 'backup',
      title: '备份迁移',
      text: '可导入电脑导出的全部数据 ZIP，也可在手机上备份自己的方案和记录。'
    },
    {
      icon: 'tools',
      title: '搜索与显示',
      text: '顶部放大镜打开独立搜索浮层，实时搜索当前模块；关闭保留关键词，清除取消筛选；视图设置显示、主题和语言，“更多”提供解析工具、抽卡吉时及帮助。'
    }
  ],
  tutorialSections: [
    {
      title: '手机首次使用',
      items: [
        '从底部导航切换搭配码、家园方案、相机参数和共鸣，无需先选择相册目录。',
        '在页面单行操作栏点“+”添加数据，点“⋯”打开本模块操作菜单。已有电脑数据时，也可从顶部“更多”导入全部数据 ZIP。',
        '顶部放大镜搜索当前模块，视图按钮设置缩略图、主题和语言；相机参数页的图片比例固定。'
      ]
    },
    {
      title: '标签筛选与管理',
      items: [
        '点“全部标签”或当前分类打开居中选择窗口，支持搜索；选中标签后直接返回列表，点分类旁的“×”清除筛选。',
        '在选择窗口搜索框右侧点“+”添加标签；进入底部“管理标签”后，拖动标签前的手柄排序，也可删除标签，完成后返回选择模式。',
        '卡片标签保持一行，长名称会省略；删除标签不会删除对应方案或相机收藏。'
      ]
    },
    {
      title: '搭配码卡片',
      items: [
        '点页面“+”，选择图片，填写搭配码、备注和一个标签后保存。搭配码可留空，稍后再编辑补充。',
        '卡片底部从左到右是复制、编辑、删除、解析图标；没有搭配码时复制和解析置灰，删除会先要求确认。',
        '点卡片可选中并显示批量操作栏；双击搭配卡片可打开大图。本模块 ZIP 导入导出位于页面“⋯”菜单。'
      ]
    },
    {
      title: '家园方案卡片',
      items: [
        '点页面“+”，输入家园码或组合码，按解析结果保存名称、封面、备注和标签。',
        '卡片底部从左到右是复制、编辑、删除三个图标；家园方案没有解析操作按钮，删除保留确认。',
        '可按家园码、组合码或标签筛选，双击卡片查看大图；本模块备份在页面“⋯”中导入导出。'
      ]
    },
    {
      title: '相机参数卡片',
      items: [
        '点页面“+”添加参数码，成功解析后填写名称并保存；也可添加封面和标签。',
        '卡片底部从左到右是复制、编辑、删除、详情图标；详情展示已经保存的解析结果，复制得到的参数码可在游戏相机中导入。',
        '点卡片选择，使用批量操作栏管理选中项；页面“⋯”提供 ZIP 导入导出。需要直接解析参数码或照片时，从顶部“更多”打开参数解析。'
      ]
    },
    {
      title: '共鸣筛选与导入',
      items: [
        '点页面“+”，按提示输入奇想手账凭据或选择 JSON 文件，核对预览后确认保存；需要在电脑获取凭据时，可安全地发送到自己的手机使用。',
        '点“全部星级”或当前星级打开居中筛选窗口，直接选择卡池排序、星级或套装索引；清除星级筛选会恢复全部星级，保留排序。',
        '记录卡片可切换第一套/第二套抽数；页面“⋯”提供导出、清空本地记录及注册、登录。登录后菜单提供上传云端、从云端同步、删除云端存档及退出。'
      ]
    },
    {
      title: '备份与电脑端能力',
      items: [
        '共鸣与衣橱可登录同一账号，通过手动上传和下载跨设备同步；搭配、家园和相机收藏继续使用“更多”的全部数据 ZIP 迁移。重要数据请定期备份。',
        '导入前核对文件来源和内容，遇到冲突按提示处理；游戏相册原图需要另行保存。',
        '相册目录管理、游戏目录自动同步及专项清理需在支持目录授权的电脑浏览器使用。手机上传照片解析需要原始照片，若提示 UID，请输入对应账号的 UID。'
      ]
    }
  ],
  notes: [
    ...sharedNotesZh,
    '手机与电脑不会自动同步。共鸣与衣橱可登录同一账号，在源设备上传后到目标设备从云端同步；搭配、家园和相机收藏通过备份迁移。',
    '参数码、凭据或原始照片解析失败时，请检查输入及窗口提示；转存或压缩过的照片可能缺少原始参数。'
  ],
  operationSections: [
    {
      icon: 'touch',
      title: '触摸操作',
      items: [
        '点按卡片选择，点底部图标执行操作；搭配和家园卡片可双击打开大图。操作按钮不会改变卡片选中状态。',
        '大图中可左右滑动切换、双指缩放，放大后用单指拖动查看细节。',
        '长列表和窗口内容可上下滚动；编辑后使用窗口底部的保存或取消按钮。'
      ]
    }
  ]
}

const desktopEn: HelpAboutDeviceContent = {
  features: [
    {
      icon: 'images',
      title: 'Album management',
      text: 'Browse game photos by date or action, with previews, favorites, notes, parameter decoding and Recently Deleted.'
    },
    {
      icon: 'outfit',
      title: 'Outfit codes',
      text: 'Save outfit images, codes and tags. Authorize the game directory to read newly shared in-game outfits.'
    },
    {
      icon: 'home',
      title: 'Home schemes',
      text: 'Manage home and combination codes with names, covers, notes and tags.'
    },
    {
      icon: 'camera',
      title: 'Camera parameters',
      text: 'Decode parameter codes or original photos, inspect the results and save camera favorites.'
    },
    {
      icon: 'resonance',
      title: 'Resonance records',
      text: 'Import, preview and save records, inspect both sets, and use account-based cloud sync across devices.'
    },
    {
      icon: 'backup',
      title: 'Data backups',
      text: 'Each collection supports import and export. More provides a full-data ZIP for migration between devices.'
    },
    {
      icon: 'cleanup',
      title: 'Targeted cleanup',
      text: 'Authorize the game directory to clean photos, screenshots and logs by item and account.'
    },
    {
      icon: 'tools',
      title: 'Search and utilities',
      text: 'Search the current module, adjust display, theme and language in View, or open parsing tools and lucky pull times in Tools.'
    }
  ],
  tutorialSections: [
    {
      title: 'Getting started and navigation',
      items: [
        'Use the left navigation for albums, outfits, home schemes, favorites and resonance. Outfits, home schemes, camera favorites and resonance work without selecting an album first.',
        'Choose NikkiPhotos_HighQuality to browse game photos. Authorize X6Game when prompted for game outfit updates, complete photo parameters or targeted cleanup.',
        'Top search applies to the current module. View controls thumbnails, theme and language; Tools offers parsing utilities; More contains backups and help.'
      ]
    },
    {
      title: 'Browse and manage photos',
      items: [
        'After choosing an album, use date or action indexes to locate photos, or open Photo favorites and Recently Deleted.',
        'Click a card to select it; double-click for a preview. Cards and the preview toolbar provide favorite, note and parameter actions.',
        'Previews support navigation, zoom and panning. Ordinary deletion moves photos to Recently Deleted for restoration; permanent deletion and cleanup modify real files.'
      ]
    },
    {
      title: 'Manage outfit codes',
      items: [
        'Choose Add outfit, select, drop or paste an image, then enter a code, note and one tag. A code can be left blank for a pending outfit.',
        'Copy and Edit are at the bottom of each card. Hover to reveal Delete and Parse at the top right. Copy and Parse are disabled without a code; double-click for a preview.',
        'Choose tags in the sidebar, add them with the plus button and drag their handles to reorder. Import or export this collection as a ZIP; authorize X6Game for in-game outfit updates.'
      ]
    },
    {
      title: 'Manage home schemes',
      items: [
        'Choose Add scheme, enter a home or combination code and save its parsed name, cover, note and tag.',
        'Filter by home codes, combination codes, uncategorized items or tags. Cards provide Copy, Edit and Delete; double-click to preview.',
        'Import or export this collection as a ZIP from the page actions. Removing a tag removes its classification, not the scheme itself.'
      ]
    },
    {
      title: 'Camera parameters and photos',
      items: [
        'In Favorites, open Camera parameters. Add a parameter code and parse it successfully before saving, or save from a photo result. Names, tags and covers are supported.',
        'Copy, Edit and Details are at the bottom of each card; hover to delete. Paste a copied parameter code into the parameter import entry in the game camera.',
        'The parsing window in Tools accepts CameraParams or uploaded photos. Complete photos need original tail data and the correct UID; authorize a directory or enter a UID as prompted. Camera favorites keep a fixed image ratio; theme and language can still change.'
      ]
    },
    {
      title: 'Resonance records',
      items: [
        'Choose Add data, select Pear-Pal credentials or a local JSON file, review the preview and confirm saving.',
        'Sort and filter in the sidebar provides newest/oldest banner order and all, 5-star or 4-star records. Select an outfit index to jump to its record.',
        'Switch between first- and second-set pulls. The action row provides JSON export, Clear local records, Register and Log in. After login, use Upload to cloud, Sync from cloud, Delete cloud save or Log out.'
      ]
    },
    {
      title: 'Backups and migration',
      items: [
        'Collection import and export are in the page actions. Resonance uses JSON; outfits, home schemes and camera favorites use ZIP files.',
        'For resonance and wardrobe, select both in the shared sync dialog, upload on the source device and sign in to the same account to download on another. For outfits, home schemes and camera favorites, export a full-data ZIP from More and import it on the destination. Save original game album photos separately.',
        'Imports validate data and apply the merge or conflict rules of each collection. Back up important data first, then follow the prompts.'
      ]
    },
    {
      title: 'Targeted cleanup',
      items: [
        'Open targeted cleanup from Tools, authorize X6Game as prompted, and choose the cleanup item and account scope.',
        'Review file counts, sizes and scope before confirming. The toolkit cannot restore real files removed by cleanup or permanent deletion.'
      ]
    }
  ],
  notes: [
    ...sharedNotesEn,
    'Album authorization, automatic game-directory access and targeted cleanup require a desktop browser with directory access support and permission for the relevant folders.',
    'Complete photo decoding needs original tail data. Cropped, re-saved or compressed images may lack the required data.'
  ],
  operationSections: [
    {
      icon: 'mouse',
      title: 'Mouse controls',
      items: [
        'Click a card to select it, or use its action buttons. Double-click outfit, home and photo cards to preview them.',
        'Hover reveals additional card actions and information. Drag tag handles to change their order.',
        'Use the mouse wheel to zoom a preview, then drag to inspect details.'
      ]
    },
    {
      icon: 'keyboard',
      title: 'Keyboard shortcuts',
      items: [
        'In a preview, use Left and Right to navigate. Esc closes the current menu, dialog or preview.',
        'Delete in a photo preview requests deletion; in Recently Deleted it requests permanent deletion. Follow the confirmation prompts.',
        'Press Ctrl+V outside text inputs in the outfit editor to paste an image.'
      ]
    }
  ]
}

const mobileEn: HelpAboutDeviceContent = {
  features: [
    {
      icon: 'outfit',
      title: 'Outfit codes',
      text: 'Save outfit images, codes and tags; use the bottom icons to copy, edit, delete or parse.'
    },
    {
      icon: 'home',
      title: 'Home schemes',
      text: 'Save home or combination codes; use the bottom icons to copy, edit and delete.'
    },
    {
      icon: 'camera',
      title: 'Camera parameters',
      text: 'Add, parse and save parameter codes, then copy them or inspect the complete saved results.'
    },
    {
      icon: 'resonance',
      title: 'Resonance records',
      text: 'Import with credentials or JSON, inspect both sets, and sign in to manually upload or download cloud records.'
    },
    {
      icon: 'backup',
      title: 'Backup migration',
      text: 'Import a full-data ZIP from your computer, or back up your own schemes and records on the phone.'
    },
    {
      icon: 'tools',
      title: 'Search and display',
      text: 'The top magnifying glass opens a separate search popover for the current module. Close keeps the query; Clear removes the filter. View changes display, theme and language; More provides parsing tools, lucky pull times and help.'
    }
  ],
  tutorialSections: [
    {
      title: 'Getting started on your phone',
      items: [
        'Use bottom navigation for Outfits, Home schemes, Camera parameters and Resonance. No album folder is needed first.',
        'Tap the page plus icon to add data and the ellipsis for collection actions. To bring existing computer data over, import a full-data ZIP from top More.',
        'The top magnifying glass opens a separate search popover for the current module. Close keeps the query; Clear removes the filter. View controls thumbnails, theme and language; camera parameter favorites keep a fixed image ratio.'
      ]
    },
    {
      title: 'Tag selection and management',
      items: [
        'Tap All tags or the current category for the centered picker. Search and choose a tag to return immediately to the collection; the nearby cross clears the filter.',
        'Tap the plus beside tag search to add a tag. Manage tags at the bottom shows drag handles for ordering and deletion; finish management to return to selection.',
        'Card tags stay on one line and long names are truncated. Removing a tag does not remove its schemes or camera favorites.'
      ]
    },
    {
      title: 'Outfit cards',
      items: [
        'Tap the page plus, choose an image and save a code, note and one tag. Leave the code blank to fill it in later.',
        'Bottom icons, from left to right, are Copy, Edit, Delete and Parse. Copy and Parse are disabled without a code; deletion requires confirmation.',
        'Tap a card to select it and reveal batch actions; double-tap an outfit card for a preview. The page ellipsis contains ZIP import and export.'
      ]
    },
    {
      title: 'Home scheme cards',
      items: [
        'Tap the page plus, enter a home or combination code and save the parsed name, cover, note and tag.',
        'Bottom icons are Copy, Edit and Delete, from left to right. Home cards have no Parse action; deletion still requires confirmation.',
        'Filter by home codes, combination codes or tags and double-tap a card to preview it. Use the page ellipsis to import or export this collection.'
      ]
    },
    {
      title: 'Camera parameter cards',
      items: [
        'Tap the page plus, enter a parameter code and parse it successfully before naming and saving it. Covers and tags are optional.',
        'Bottom icons are Copy, Edit, Delete and Details, from left to right. Details shows the saved parse result; paste a copied code into the game camera parameter import.',
        'Tap cards to select them for batch actions. The page ellipsis provides ZIP import and export. For direct code or photo decoding, open parsing tools from top More.'
      ]
    },
    {
      title: 'Resonance filtering and import',
      items: [
        'Tap the page plus, supply Pear-Pal credentials or a JSON file, review the preview and confirm saving. If credentials must be obtained on a computer, transfer them securely to your own phone.',
        'Tap All rarities or the active rarity for the centered picker. Choose banner order, rarity or an outfit index; clearing rarity restores all records while keeping the order.',
        'Switch between first- and second-set pulls. The ellipsis provides export, Clear local records, Register and Log in. After login, the menu offers Upload to cloud, Sync from cloud, Delete cloud save and Log out.'
      ]
    },
    {
      title: 'Backups and desktop capabilities',
      items: [
        'Sign in to the same account to manually upload and download resonance records across devices. Transfer outfits, home schemes and camera favorites using the full-data ZIP in More. Back up important data regularly.',
        'Check the backup source and contents, and follow conflict prompts when importing. Save original game album photos separately.',
        'Album folder management, automatic game-directory updates and targeted cleanup require a supported desktop browser. For photo decoding on a phone, supply the original photo and enter the matching account UID if prompted.'
      ]
    }
  ],
  notes: [
    ...sharedNotesEn,
    'Phone and computer records do not sync automatically. For resonance and wardrobe, sign in to the same account, upload on the source device and download on the destination. Transfer outfits, home schemes and camera favorites with backups.',
    'If code, credential or photo decoding fails, check the input and dialog prompts. Re-saved or compressed photos may lack original parameters.'
  ],
  operationSections: [
    {
      icon: 'touch',
      title: 'Touch controls',
      items: [
        'Tap a card to select it and its bottom icons for actions. Double-tap outfit and home cards to preview them. Action buttons keep the selection unchanged.',
        'Swipe horizontally in a preview to navigate, pinch to zoom and drag with one finger after zooming in.',
        'Scroll long lists and dialog contents vertically. Use Save or Cancel at the bottom of an editor when finished.'
      ]
    }
  ]
}

export const helpAboutZh: FullLocaleMessages['helpAbout'] = {
  title: '使用帮助与介绍',
  eyebrow: '暖立方 · 无限暖暖工具集',
  introTitle: '网站介绍',
  intro:
    '暖立方（NikkiCube）是一个在浏览器中使用的无限暖暖工具集，帮助你整理搭配方案、家园方案、相机参数、共鸣记录和游戏照片。',
  privacyNote:
    '照片在浏览器本地读取和处理。搭配码解析、共鸣导入和外部链接会请求对应服务；共鸣与衣橱云同步连接本站服务，手动上传会将所选模块存档保存到云端，不上传本地照片。',
  featuresTitle: '特色功能',
  tutorialTitle: '使用教程',
  notesTitle: '注意事项',
  desktop: desktopZh,
  mobile: mobileZh,
  confirm: '我知道了',
  closeAria: '关闭使用帮助与介绍窗口'
}
export const helpAboutEn: FullLocaleMessages['helpAbout'] = {
  title: 'Help and introduction',
  eyebrow: 'NikkiCube · Infinity Nikki Toolkit',
  introTitle: 'About this site',
  intro:
    'NikkiCube is a browser-based Infinity Nikki toolkit for organizing outfits, home schemes, camera parameters, resonance records and game photos.',
  privacyNote:
    'Photos are read and processed locally. Outfit-code decoding, resonance imports and external links contact the relevant services. Resonance and wardrobe cloud sync contacts this site; manual upload stores selected module saves in the cloud without uploading local photos.',
  featuresTitle: 'Highlights',
  tutorialTitle: 'How to use',
  notesTitle: 'Important notes',
  desktop: desktopEn,
  mobile: mobileEn,
  confirm: 'Got it',
  closeAria: 'Close help and introduction'
}
