export interface ResonanceMessages {
  title: string
  bannerOrder: string
  newestFirst: string
  oldestFirst: string
  displayOptions: string
  rarityFilter: string
  allRarities: string
  onlyFiveStar: string
  onlyFourStar: string
  noMatchingRarity: string
  emptyTitle: string
  emptyDescription: string
  clearRecords: string
  clearTitle: string
  clearMessage: string
  clearConfirm: string
  clearCancel: string
  clearing: string
  clearSuccess: string
  clearError: string
  addData: string
  exportData: string
  exportSuccess: string
  exportError: string
  importMethod: string
  fromPearpal: string
  fromFile: string
  fileDescription: string
  chooseFile: string
  noFileSelected: string
  fileRequired: string
  fileInvalid: string
  fileEmpty: string
  addTitle: string
  close: string
  loginPearpal: string
  loginPearpalDesc: string
  pearpalSite: string
  userscriptInstall: string
  userscriptMobileIntro: string
  userscriptDesktopIntro: string
  userscriptMobileSteps: string[]
  userscriptDesktopSteps: string[]
  userscriptTroubleshooting: string[]
  cookieJsonGuide: string
  getCookie: string
  videoTutorials: string
  desktopVideoTutorial: string
  androidVideoTutorial: string
  iosVideoTutorial: string
  mobileAndroidBrowsers: string
  mobileIosBrowsers: string
  mobileCredentialTip: string
  cookieMethods: string
  mobileBookmarkStep1: string
  mobileBookmarkStep2: string
  mobileBookmarkStep3: string
  mobileBookmarkStep5: string
  userscriptMethod: string
  mobileUserscriptMethod: string
  bookmarkMethod: string
  mobileBookmarkMethod: string
  consoleMethod: string
  sourceAttributionLabel: string
  sourceAttribution: string
  cookieStepsTitle: string
  bookmarkStep1: string
  bookmarkStep2: string
  bookmarkStep3: { text: string; emphasis: string }
  bookmarkStep4: string
  bookmarkStep5: string
  bookmarkTip: { text: string; emphasis: string }
  consoleStep2: string
  consoleStep3: string
  consoleStep4: string
  consoleStep5: string
  consoleStep6: string
  copyCode: string
  copyCodeSuccess: string
  pasteHere: string
  pasteSuccess: string
  pasteSuccessNoUid: string
  pasteFailed: string
  roleId: string
  token: string
  openId: string
  credentialsRequired: string
  uidMismatch: string
  regionMismatch: string
  authFailed: string
  processBanner: (current: number, total: number) => string
  import: string
  previewTitle: string
  replaceAllNotice: string
  previewBanner: string
  previewOutfit: string
  previewRarity: string
  previewSet1: string
  confirmImport: string
  importing: string
  saving: string
  importSuccess: (count: number) => string
  partialImport: (count: number) => string
  importError: string
  saveError: string
  noRecords: string
  pulls: (count: number) => string
  average: (count: string) => string
  setSelection: string
  setOne: string
  setTwo: string
  ownedProgress: (owned: number, total: number) => string
  setPulls: (count: string) => string
  knownAverage: (count: string) => string
  manualStatsNote: string
  rarity: (value: number) => string
}

export const resonanceZh: ResonanceMessages = {
  title: '共鸣记录',
  bannerOrder: '卡池排序',
  newestFirst: '最新优先',
  oldestFirst: '最早优先',
  displayOptions: '排序与筛选',
  rarityFilter: '星级筛选',
  allRarities: '全部展示',
  onlyFiveStar: '只展示五星',
  onlyFourStar: '只展示四星',
  noMatchingRarity: '当前星级没有套装记录',
  emptyTitle: '还没有共鸣记录',
  emptyDescription: '点击右上角“导入数据”，也可登录后从云端同步已有存档，查看套装部件的获取记录。',
  clearRecords: '清空本地记录',
  clearTitle: '清空本地共鸣记录',
  clearMessage:
    '将删除当前浏览器保存的全部共鸣记录，云端存档保留。此操作无法撤销，建议先导出备份或上传最新记录。',
  clearConfirm: '清空本地记录',
  clearCancel: '取消',
  clearing: '正在清空…',
  clearSuccess: '本地共鸣记录已清空，云端存档保留。',
  clearError: '清空失败，记录未更改，请重试。',
  addData: '导入数据',
  exportData: '导出数据',
  exportSuccess: '共鸣记录已导出。',
  exportError: '导出失败，请重试。',
  importMethod: '导入方式',
  fromPearpal: '从美鸭梨导入',
  fromFile: '从文件导入',
  fileDescription: '选择本项目共鸣备份，或暖暖共鸣录新旧版 JSON 文件。文件仅在浏览器中读取。',
  chooseFile: '选择 JSON 文件',
  noFileSelected: '尚未选择文件',
  fileRequired: '请先选择 JSON 文件。',
  fileInvalid: '文件不是受支持的共鸣 JSON 格式。',
  fileEmpty: '文件中没有可识别的共鸣记录。',
  addTitle: '添加共鸣数据',
  close: '关闭',
  loginPearpal: '登录美鸭梨网站',
  loginPearpalDesc: '在新标签页打开美鸭梨并登录叠纸账号。登录后返回此窗口获取凭据。',
  pearpalSite: '打开美鸭梨',
  userscriptInstall: '安装获取 Cookie 脚本',
  userscriptMobileIntro:
    '请使用支持用户脚本功能的手机浏览器。强烈推荐 Via、X 浏览器作为首选：轻便、快捷、纯净，也很适合作为日常主力浏览器使用。',
  userscriptDesktopIntro: '已安装油猴（Tampermonkey）等用户脚本管理扩展的用户，可以安装此脚本。',
  userscriptMobileSteps: [
    '使用支持用户脚本的浏览器打开本站，首选 Via、X 浏览器。',
    '点击“安装获取 Cookie 脚本”，按浏览器提示确认安装并启用。',
    '点击上方“打开美鸭梨”，在同一浏览器中登录对应区服账号，并确认当前角色。',
    '若美鸭梨页面之前已经打开，请刷新页面，找到右下角“获取 Cookie”按钮。',
    '点击“获取 Cookie”复制完整凭据，返回本站，在下方输入框粘贴。'
  ],
  userscriptDesktopSteps: [
    '确认浏览器已安装并启用油猴（Tampermonkey）等用户脚本管理扩展。',
    '点击“安装获取 Cookie 脚本”，在扩展打开的安装页面确认安装。',
    '在同一浏览器中点击上方“打开美鸭梨”，登录对应区服账号并确认当前角色。',
    '打开或刷新美鸭梨页面，点击右下角“获取 Cookie”按钮。',
    '返回本站，在下方输入框粘贴完整凭据。'
  ],
  userscriptTroubleshooting: [
    '点击安装链接后若只显示源码，可在浏览器或扩展的脚本管理中通过此链接添加。',
    '页面没有出现按钮时，请检查脚本是否启用，再刷新美鸭梨页面。',
    '提示登录失效时，请重新登录并确认角色后再次获取。'
  ],
  cookieJsonGuide:
    '获取登录凭据后，返回此窗口粘贴完整 JSON。格式应为 {"roleid":"你的UID","token":"登录令牌","id":"账号ID"}，必须同时包含 roleid、token、id 三项，且值均不能为空。请勿只复制某个字段，或遗漏大括号、双引号。',
  getCookie: '获取登录凭据',
  videoTutorials: '小红书视频教程',
  desktopVideoTutorial: '电脑端',
  androidVideoTutorial: '安卓端',
  iosVideoTutorial: '苹果端',
  mobileCredentialTip: '建议使用电脑端获取登录凭据，操作更加方便。获取后可复制到手机端继续导入。',
  mobileAndroidBrowsers: '安卓建议浏览器：Chrome（谷歌）、Firefox（火狐）。',
  mobileIosBrowsers: 'iOS 建议浏览器：Chrome（谷歌）、Firefox（火狐）、Safari。',
  cookieMethods: '凭据获取方式',
  mobileBookmarkStep1: '点击“复制代码”，复制完整的书签脚本。',
  mobileBookmarkStep2: '在浏览器中将任意网页添加为书签。',
  mobileBookmarkStep3:
    '编辑该书签，将网址（URL）替换为刚复制的完整代码，确认开头保留 javascript:，然后保存。',
  mobileBookmarkStep5: '在美鸭梨页面运行书签。书签可从书签列表打开。',
  userscriptMethod: '脚本法（油猴推荐）',
  mobileUserscriptMethod: '脚本法（推荐）',
  bookmarkMethod: '书签法（推荐）',
  mobileBookmarkMethod: '书签法',
  consoleMethod: '控制台方法',
  sourceAttributionLabel: '方法来源',
  sourceAttribution: '以下书签法、控制台法获取登录凭据的方法来自暖暖共鸣录。',
  cookieStepsTitle: '获取凭据后粘贴到下方：',
  bookmarkStep1: '将「美鸭梨 Cookie」书签拖到书签栏（仅需设置一次）：',
  bookmarkStep2: '切换到已登录的美鸭梨页面。',
  bookmarkStep3: {
    text: '在已登录的美鸭梨页面点击「美鸭梨 Cookie」书签，',
    emphasis: '书签务必选择“在当前页面打开”，不要在新标签页打开。'
  },
  bookmarkStep4: '复制弹窗中输出的凭据数据。',
  bookmarkStep5: '返回本页，将凭据粘贴到下方输入框。',
  bookmarkTip: {
    text: '可以保留此书签，之后同步时继续使用。',
    emphasis:
      '电脑版 QQ 浏览器等部分浏览器可能默认在新标签页打开书签，请将打开方式改为“当前页面打开”，否则可能提示“请在美鸭梨网站使用此书签”。'
  },
  consoleStep2: '在已登录的美鸭梨页面打开开发者工具（按 F12 或右键选择“检查”）。',
  consoleStep3: '切换到“控制台”标签。',
  consoleStep4: '复制下方代码，粘贴到控制台并按回车：',
  consoleStep5: '如浏览器提示，请按提示输入 allow pasting 或“允许粘贴”。',
  consoleStep6: '复制控制台输出的凭据数据，返回本页粘贴。',
  copyCode: '复制代码',
  copyCodeSuccess: '代码已复制',
  pasteHere: '粘贴书签或控制台输出',
  pasteSuccess: '数据粘贴成功！',
  pasteSuccessNoUid: '请填写游戏内 UID',
  pasteFailed: '解析输入数据失败，请确认格式正确。',
  roleId: '游戏内 UID',
  token: 'Momo Token',
  openId: 'Momo ID',
  credentialsRequired: '请填写完整的凭据信息。',
  uidMismatch: '美鸭梨账号 UID 与输入的 UID 不一致。',
  regionMismatch: '无法确认角色属于所选服务器。请在美鸭梨切换到正确角色，再重新获取凭据。',
  authFailed:
    '当前凭据已过期或失效，请前往美鸭梨网站重新登录并获取新凭据，返回本页粘贴后重试。若仍然报错，请在浏览器无痕窗口中登录美鸭梨，重新获取凭据后重试。',
  processBanner: (current, total) => `正在处理第 ${current} 个卡池，共 ${total} 个`,
  import: '获取预览',
  previewTitle: '导入预览',
  replaceAllNotice: '确认导入后，本次预览将替换全部本地共鸣记录；未包含的旧记录将被删除。',
  previewBanner: '卡池',
  previewOutfit: '套装',
  previewRarity: '稀有度',
  previewSet1: '套装总抽数',
  confirmImport: '确认导入',
  importing: '正在获取共鸣数据，请稍候…',
  saving: '正在保存…',
  importSuccess: (count) => `已导入 ${count} 套记录`,
  partialImport: (count) =>
    `${count} 个卡池未能解析；确认导入只保存成功解析的记录，这些卡池的旧记录也将被删除。`,
  importError: '导入失败，请重试。',
  saveError: '保存失败，请检查浏览器存储空间和 IndexedDB 状态后重试。',
  noRecords: '奇想手账中没有找到可识别的卡池抽卡记录。',
  pulls: (count) => `总抽数：${count}`,
  average: (count) => `平均抽数：${count}`,
  setSelection: '选择套数',
  setOne: '第一套',
  setTwo: '第二套',
  ownedProgress: (owned, total) => `已获得 ${owned} / ${total} 件`,
  setPulls: (count) => `本套已记录抽数：${count}`,
  knownAverage: (count) => `已知部件均抽：${count}`,
  manualStatsNote: '补录部件计入获得进度，不计入抽数和均值。',
  rarity: (value) => `${value}星`
}

export const resonanceEn: ResonanceMessages = {
  title: 'Resonance Records',
  bannerOrder: 'Banner order',
  newestFirst: 'Newest first',
  oldestFirst: 'Oldest first',
  displayOptions: 'Sort and filter',
  rarityFilter: 'Rarity filter',
  allRarities: 'Show all',
  onlyFiveStar: '5-star only',
  onlyFourStar: '4-star only',
  noMatchingRarity: 'No outfits match this rarity',
  emptyTitle: 'No resonance records yet',
  emptyDescription:
    'Import from Pear-Pal Whim-Log or JSON, or sign in to download an existing cloud save and review outfit piece acquisition order.',
  clearRecords: 'Clear local records',
  clearTitle: 'Clear local resonance records',
  clearMessage:
    'This deletes all resonance records in this browser and leaves the cloud save intact. It cannot be undone; export a backup or upload the latest records first.',
  clearConfirm: 'Clear local records',
  clearCancel: 'Cancel',
  clearing: 'Clearing…',
  clearSuccess: 'Local resonance records cleared. The cloud save remains.',
  clearError: 'Could not clear records. They were not changed; try again.',
  addData: 'Import data',
  exportData: 'Export data',
  exportSuccess: 'Resonance records exported.',
  exportError: 'Export failed. Please try again.',
  importMethod: 'Import method',
  fromPearpal: 'Import from Pear-Pal',
  fromFile: 'Import from file',
  fileDescription:
    'Choose a resonance backup from this app or an old or new Resonance Recorder JSON file. The file is read only in your browser.',
  chooseFile: 'Choose JSON file',
  noFileSelected: 'No file selected',
  fileRequired: 'Choose a JSON file first.',
  fileInvalid: 'This is not a supported resonance JSON file.',
  fileEmpty: 'No supported resonance records were found in the file.',
  addTitle: 'Add resonance data',
  close: 'Close',
  loginPearpal: 'Sign in to Pear-Pal',
  loginPearpalDesc:
    'Open Pear-Pal in a new tab and sign in with your Infold account. Return here to get your credentials.',
  pearpalSite: 'Open Pear-Pal',
  userscriptInstall: 'Install Cookie userscript',
  userscriptMobileIntro:
    'Use a mobile browser with userscript support. Via and XBrowser are our top recommendations: lightweight, fast and clean, and well suited for everyday browsing.',
  userscriptDesktopIntro:
    'If you have a userscript manager extension such as Tampermonkey installed, you can install this script.',
  userscriptMobileSteps: [
    'Open this site in a browser with userscript support, preferably Via or XBrowser.',
    'Tap “Install Cookie userscript”, then confirm installation and enable the script.',
    'Tap “Open Pear-Pal” above. Sign in to the account for your selected server in the same browser and confirm your current role.',
    'If Pear-Pal was already open, refresh it. Find the “Get Cookie” button at the bottom right.',
    'Tap “Get Cookie” to copy the complete credentials, then return here and paste them in the field below.'
  ],
  userscriptDesktopSteps: [
    'Make sure a userscript manager extension such as Tampermonkey is installed and enabled.',
    'Click “Install Cookie userscript” and confirm installation on the page opened by the extension.',
    'Click “Open Pear-Pal” above in the same browser, sign in to the account for your selected server and confirm your current role.',
    'Open or refresh Pear-Pal, then click “Get Cookie” at the bottom right.',
    'Return here and paste the complete credentials in the field below.'
  ],
  userscriptTroubleshooting: [
    'If the installation link only shows source code, add the link through your browser or extension’s script manager.',
    'If the button does not appear, check that the script is enabled, then refresh Pear-Pal.',
    'If sign-in has expired, sign in again and confirm your role before trying again.'
  ],
  cookieJsonGuide:
    'After getting your sign-in credentials, return here and paste the complete JSON, such as {"roleid":"your UID","token":"sign-in token","id":"account ID"}. All three fields — roleid, token and id — must be present with non-empty values. Copy the entire object, including braces and double quotes, rather than an individual field.',
  getCookie: 'Get sign-in credentials',
  videoTutorials: 'Xiaohongshu video tutorials',
  desktopVideoTutorial: 'Desktop',
  androidVideoTutorial: 'Android',
  iosVideoTutorial: 'iOS',
  mobileCredentialTip:
    'We recommend obtaining sign-in credentials on a computer for easier access. You can then copy them to your phone to continue importing.',
  mobileAndroidBrowsers: 'Recommended browsers for Android: Chrome and Firefox.',
  mobileIosBrowsers: 'Recommended browsers for iOS: Chrome, Firefox and Safari.',
  cookieMethods: 'Credential method',
  mobileBookmarkStep1: 'Tap “Copy code” to copy the complete bookmark script.',
  mobileBookmarkStep2: 'Bookmark any page in your browser.',
  mobileBookmarkStep3:
    'Edit the bookmark and replace its URL with the copied code. Keep the javascript: prefix, then save.',
  mobileBookmarkStep5:
    'Run the bookmark on the Pear-Pal page. You can open it from your bookmarks list.',
  userscriptMethod: 'Userscript (Tampermonkey recommended)',
  mobileUserscriptMethod: 'Userscript (recommended)',
  bookmarkMethod: 'Bookmark (recommended)',
  mobileBookmarkMethod: 'Bookmark',
  consoleMethod: 'Console',
  sourceAttributionLabel: 'Method source',
  sourceAttribution:
    'The bookmark and console methods below for getting sign-in credentials come from Resonance Recorder.',
  cookieStepsTitle: 'Paste the copied credentials below:',
  bookmarkStep1: 'Drag the "Pear-Pal Cookie" bookmark to your bookmarks bar (once only):',
  bookmarkStep2: 'Switch to a signed-in Pear-Pal page.',
  bookmarkStep3: {
    text: 'On the signed-in Pear-Pal page, click the "Pear-Pal Cookie" bookmark. ',
    emphasis: 'Open it in the current tab, not a new tab.'
  },
  bookmarkStep4: 'Copy the credentials shown in the popup.',
  bookmarkStep5: 'Return here and paste the credentials below.',
  bookmarkTip: {
    text: 'Keep this bookmark for future syncs. ',
    emphasis:
      'Some desktop browsers, including QQ Browser, may open bookmarks in new tabs by default. Change the opening behavior to the current tab; otherwise you may see “Use this bookmark on the Pear-Pal website.”'
  },
  consoleStep2:
    'Open developer tools on a signed-in Pear-Pal page (press F12 or right-click and choose Inspect).',
  consoleStep3: 'Switch to the Console tab.',
  consoleStep4: 'Copy the code below, paste it into the console, and press Enter:',
  consoleStep5: 'If prompted, follow the browser message and type allow pasting.',
  consoleStep6: 'Copy the credentials printed in the console and paste them here.',
  copyCode: 'Copy code',
  copyCodeSuccess: 'Code copied',
  pasteHere: 'Paste bookmark or console output',
  pasteSuccess: 'Data pasted successfully!',
  pasteSuccessNoUid: 'Enter your in-game UID',
  pasteFailed: 'Could not parse the input. Check that it uses the expected format.',
  roleId: 'In-game UID',
  token: 'Momo Token',
  openId: 'Momo ID',
  credentialsRequired: 'Please fill in all required credential fields.',
  uidMismatch: 'The UID from Pear-Pal does not match the entered UID.',
  regionMismatch:
    'The role could not be verified for the selected server. Select the correct role on Pear-Pal and get fresh credentials.',
  authFailed:
    'Your credentials have expired or are no longer valid. Sign in to the Pear-Pal website again to obtain fresh credentials, then paste them here and retry. If the error persists, sign in to Pear-Pal in a private browser window, get new credentials, and try again.',
  processBanner: (current, total) => `Processing banner ${current} of ${total}`,
  import: 'Preview import',
  previewTitle: 'Import preview',
  replaceAllNotice:
    'Confirming this import replaces all local resonance records with this preview. Previous records missing from the preview will be deleted.',
  previewBanner: 'Banner',
  previewOutfit: 'Outfit',
  previewRarity: 'Rarity',
  previewSet1: 'Outfit total pulls',
  confirmImport: 'Confirm import',
  importing: 'Fetching resonance data, please wait…',
  saving: 'Saving…',
  importSuccess: (count) => `Imported ${count} outfit records`,
  partialImport: (count) =>
    `${count} banners could not be parsed. Confirming saves only parsed records and also deletes previous records for these banners.`,
  importError: 'Import failed. Try again.',
  saveError: 'Save failed. Check browser storage and IndexedDB, then try again.',
  noRecords: 'No supported banner pull records were found in Whim-Log.',
  pulls: (count) => `Total pulls: ${count}`,
  average: (count) => `Average pulls: ${count}`,
  setSelection: 'Select set',
  setOne: 'First set',
  setTwo: 'Second set',
  ownedProgress: (owned, total) => `Owned ${owned} / ${total} pieces`,
  setPulls: (count) => `Recorded pulls for this set: ${count}`,
  knownAverage: (count) => `Known-piece average: ${count}`,
  manualStatsNote: 'Manual entries count as owned, but are excluded from pull totals and averages.',
  rarity: (value) => `${value}-star`
}
