export const privacyPolicy = {
  zh: {
    title: '隐私政策',
    close: '关闭隐私政策',
    updated: '更新日期：2026年11月28日',
    intro: '暖立方由素茉penny维护。以下说明本工具集实际使用的数据、用途及您的管理方式。',
    sections: [
      [
        '本地数据与文件',
        '相册照片由浏览器读取。搭配码、家园方案、相机参数、导入的共鸣与衣橱记录、角色资料及偏好设置等保存在当前浏览器的 IndexedDB 或本地存储中；普通相册浏览和本地图片编辑不会主动上传原图。授权目录后，相关功能可读取文件；保存、自动备份、删除等操作也可能写入或删除您授权的文件。备份文件保存在您选择的位置，请自行保管。'
      ],
      [
        '官方数据导入与在线解析',
        '使用美鸭梨导入时，您提供的登录令牌和账号标识由浏览器直接发送至所选区服的官方接口，用于校验角色和获取记录；这些凭据不写入本站持久化存储，旧的本站转发接口已停用。导入结果可保存在本地。解析搭配码、家园码时，相关代码或资源标识会发送至本站接口，再由服务端请求官方数据。请勿向他人公开登录凭据。'
      ],
      [
        '可选账号与云同步',
        '使用数据同步时，本站服务端保存您注册的用户名、密码哈希、会话信息，以及您主动上传的共鸣和衣橱数据。登录时使用必要的会话 Cookie 维持身份；密码不会以明文形式保存在账号数据库中。云端存档与本地数据分开管理，清除本地数据或退出登录不会删除云端存档。'
      ],
      [
        '错误诊断与服务运行',
        '为定位故障，启用错误上报时会自动将错误消息、调用栈、发生时间、版本、页面路径及来源、相关操作步骤，以及浏览器、系统、设备型号（如可获取）、语言、时区、屏幕、网络状态和存储用量等技术信息发送至本站服务端。代码会过滤已知凭据字段、请求正文和文件内容等，并对文本作脱敏处理，但不承诺所有自由文本都能完全识别。服务端会使用经哈希或签名处理的 IP 标识限制请求频率。点赞接口只保存累计数量。'
      ],
      [
        '第三方服务与广告',
        '网站使用 Cloudflare 提供托管、接口和数据库服务，使用 ImageKit 加载部分图片，并在相关功能中访问游戏官方接口、哔哩哔哩视频及外部链接。连接这些服务时，服务提供方可能接收 IP 地址、浏览器信息及请求信息，并按其政策处理。本站接入 Google AdSense；Google 及其他第三方广告服务商可能在您的浏览器中放置或读取 Cookie，或使用网络信标、IP 地址和其他标识符，用于广告投放、衡量和个性化广告（如适用）。'
      ],
      [
        '您的选择与数据清理',
        '您可以不使用云同步或官方数据导入，并通过浏览器管理目录权限、Cookie 和站点存储。在「更多」中导出备份、清除缓存或清除本地数据；清除前请先备份，浏览器数据丢失后本站无法替您恢复。云端存档可在数据同步功能中删除；电脑上的原图和备份文件需另行管理。Google 广告偏好可通过下方链接调整；关闭个性化广告不代表停止全部广告或所有必要的数据处理。'
      ],
      [
        '保存与联系',
        '本地数据通常保留至您或浏览器删除；云端存档保留至您删除或服务清理。当前实现未对所有账号信息及诊断记录设定统一的自动删除期限，本站不承诺固定天数后自动清除。如需咨询隐私、申请处理账号或服务端数据，请通过「更多 → 问题反馈」或作者主页联系素茉penny；请勿在公开反馈中附带密码、登录令牌或私人文件。'
      ],
      [
        '政策更新',
        '本政策适用于暖立方工具集，将随实际功能和数据处理方式调整，并在此更新日期。外部网站和服务适用其各自的隐私政策。'
      ]
    ],
    googleData: 'Google 如何使用合作伙伴网站或应用中的信息',
    googlePrivacy: 'Google 隐私政策',
    adSettings: 'Google 广告偏好'
  },
  en: {
    title: 'Privacy policy',
    close: 'Close privacy policy',
    updated: 'Updated: November 28, 2026',
    intro:
      'NikkiCube is maintained by 素茉penny. This policy explains the data used by the toolkit, its purposes and your controls.',
    sections: [
      [
        'Local data and files',
        'Your browser reads album photos locally. Outfit codes, home schemes, camera parameters, imported resonance and wardrobe records, profile details and preferences are stored in IndexedDB or browser storage. Ordinary album browsing and local image editing do not proactively upload original images. Authorized folder features can read files; saving, automatic backup and deletion may also write or delete authorized files. Backups are saved to the location you choose; keep them safe.'
      ],
      [
        'Official imports and online decoding',
        'For Pear-Pal imports, your browser sends the supplied sign-in token and account identifier directly to the selected region’s official API to verify your character and retrieve records. These credentials are not written to this site’s persistent storage; the former site proxy is retired. Imported results can be stored locally. Decoding outfit or home codes sends the relevant code or resource identifier to this site’s API, which requests official data. Do not disclose your sign-in credentials.'
      ],
      [
        'Optional account and cloud sync',
        'Data sync stores your registered username, password hash, session information and the resonance and wardrobe data you choose to upload on our server. A necessary session cookie maintains your sign-in. The account database does not store passwords in plain text. Cloud saves and local data are separate: clearing local data or signing out does not delete cloud saves.'
      ],
      [
        'Diagnostics and service operation',
        'When error reporting is enabled, faults automatically send technical information to our server: error messages, stacks, timestamps, versions, page paths and origins, related operation breadcrumbs, browser, OS, device model where available, language, timezone, screen, network status and storage usage. The code filters known credential fields, request bodies and file content and redacts text, but cannot guarantee detection of all sensitive free text. The server uses hashed or signed IP identifiers for rate limiting. The like endpoint stores only an aggregate count.'
      ],
      [
        'Third-party services and advertising',
        'Cloudflare provides hosting, APIs and databases; ImageKit serves some images. Relevant features connect to official game APIs, Bilibili videos and external links. These providers may receive your IP address, browser and request information and handle it under their own policies. This site integrates Google AdSense. Google and other advertising providers may place or read cookies, or use web beacons, IP addresses and other identifiers for ad delivery, measurement and personalized advertising where applicable.'
      ],
      [
        'Your choices and deletion',
        'You can avoid cloud sync or official imports and manage folder permissions, cookies and site storage in your browser. Use More to export backups, clear caches or clear local data. Back up first: we cannot restore lost browser data for you. Delete cloud saves through Data sync; manage original photos and backup files separately. Use the link below to adjust Google ad preferences. Turning off personalized ads does not stop all ads or all necessary data processing.'
      ],
      [
        'Retention and contact',
        'Local data generally remains until you or your browser delete it; cloud saves remain until deletion or service cleanup. The current implementation has no single automatic deletion period for all account and diagnostic records, so we do not promise deletion after a fixed number of days. For privacy questions or account/server-data requests, contact 素茉penny through More → Feedback or the author’s profile. Do not include passwords, sign-in tokens or private files in public feedback.'
      ],
      [
        'Policy updates',
        'This policy applies to the NikkiCube toolkit and will be updated here, with its date, when features or data handling change. External websites and services have their own privacy policies.'
      ]
    ],
    googleData: 'How Google uses information from partner sites and apps',
    googlePrivacy: 'Google Privacy Policy',
    adSettings: 'Google ad preferences'
  }
}
