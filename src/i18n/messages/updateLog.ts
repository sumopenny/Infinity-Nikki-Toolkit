import { currentVersion } from '../version'
// 更新记录文案：当前版本和历史版本保持结构化，便于发布时维护。
import type { FullLocaleMessages } from '../types'

export const updateLogZh: FullLocaleMessages['updateLog'] = {
  title: '更新记录',
  helpAbout: '使用帮助',
  currentTitle: '当前版本',
  currentVersion,
  currentDate: '2026.11.28 更新',
  currentItems: [
    {
      title: '完善星冕套装共鸣记录。',
      text: '修复赠送部件合并与星冕抽数统计，优化套装名称和专属卡片样式。请重新获取并导入美鸭梨手帐数据，以更新已保存的部件记录和抽数统计。'
    },
    {
      title: '搭配码支持识别自定义饰品。',
      text: '含自定义饰品的部分搭配码会在对应饰品卡片右上角显示圆形「自」标记，方便辨认。'
    },
    {
      title: '美鸭梨脚本新增登录信息清理。',
      text: '新增「登录信息过期时点我清理登录信息」按钮，遇到凭据过期或登录异常时，可点击清理页面的旧信息并重新登录，省去前往无痕浏览器重新获取凭据的步骤。'
    },
    {
      title: '个人衣橱无需导入即可浏览。',
      text: '未导入衣橱数据时，也可浏览、搜索和筛选套装与部件。收集状态显示为「未知」，导入后即可查看自己的拥有情况和收集进度。'
    },
    {
      title: '补充游戏 3.0 资源。',
      text: '更新服装、套装、妆容、拍照动作及头像框相关资源，完善新增服装的部件分类和进化形态识别。'
    },
    {
      title: '完善跨设备、跨浏览器数据迁移指引。',
      text: '手机端模块为空时，新增数据迁移说明。可在原设备或浏览器中通过「更多」→「导出全部数据」导出备份，再在新浏览器中通过「更多」→「导入全部数据」完成迁移。'
    }
  ],
  historyTitle: '历史版本记录',
  history: [
    {
      version: 'v3.0',
      date: '2026.11.27',
      items: [
        {
          title: '全新电脑端主页上线。',
          text: '新增沉浸式主页，搭配角色昵称问候与轻盈的入场动效，打开网站更有归属感。'
        },
        {
          title: '主页壁纸自由更换。',
          text: '支持选择预设壁纸，也可上传、拖入或粘贴自己的图片，自由调整背景模糊度和文字明暗。新增水波互动效果，默认开启，可按喜好关闭。'
        },
        {
          title: '游戏相册打开更方便。',
          text: '授权游戏目录 X6Game 后，自动找到大喵高画质相册，支持切换不同账号的相册。单独存放的照片仍可通过「打开独立相册」浏览。优化授权恢复与超时处理，目录失效时提示重新选择。'
        },
        {
          title: '新增角色资料与头像装扮。',
          text: '电脑端授权游戏相册后，在右上角「相册菜单」查看角色资料；手机端打开「更多」，在顶部输入 UID 即可查询。支持查看昵称、头像、等级、角色创建时间，并通过「切换头像框」为本站头像应用喜欢的动态头像框。'
        },
        {
          title: '数据备份升级为独立页面。',
          text: '电脑端左侧新增「数据备份」，集中管理搭配码、家园方案和相机参数的自动备份。主页会在未开启备份或备份异常时提醒。'
        },
        {
          title: '大图预览工具栏支持拖动。',
          text: '电脑端可拖动大图预览工具栏，松手后自动贴顶或贴底，并进入半隐藏状态，鼠标移上即可展开，减少对照片的遮挡。'
        },
        {
          title: '优化手机导航与界面细节。',
          text: '手机底部导航新增选中图标放大效果，优化按压与回弹反馈。统一多处弹窗、按钮和菜单样式。'
        },
        {
          title: '更新游戏 3.0 相关内容。',
          text: '「抽卡吉时」已更新至游戏 3.0 版本。游戏 3.0 的服装、妆容图鉴及其他相关资源将逐步补充更新。'
        },
        {
          title: '工具集启用新地址。',
          text: '新地址：nikkicube.pages.dev。旧站用户请先导出全部数据，再到新站导入，不同网址的本地数据不会自动互通。'
        }
      ]
    }
  ],
  dontShowAgain: '当前版本不再提示',
  dontShowEverAgain: '不再提示',
  confirm: '我知道了',
  closeAria: '关闭更新记录窗口'
}

export const updateLogEn: FullLocaleMessages['updateLog'] = {
  title: 'Release history',
  helpAbout: 'Help',
  currentTitle: 'Current version',
  currentVersion,
  currentDate: 'Updated 2026.11.28',
  currentItems: [
    {
      title: 'Improved Crown outfit Resonance records.',
      text: 'Fixed gift piece merging and Crown pull statistics, and refined outfit names and exclusive card styling. Please fetch and import your Pear-Pal journal data again to update saved piece records and pull statistics.'
    },
    {
      title: 'Outfit codes now recognize customized accessories.',
      text: 'For supported outfit codes containing customized accessories, a circular “自” badge appears at the top right of the corresponding accessory card for easy identification.'
    },
    {
      title: 'The Pear-Pal userscript now supports clearing sign-in information.',
      text: 'Added a “Sign-in expired? Click to clear sign-in information” button. If your credentials expire or you encounter sign-in issues, click it to clear old information on the page and sign in again, saving you the step of opening a private browsing window to obtain new credentials.'
    },
    {
      title: 'Browse your personal wardrobe without importing data.',
      text: 'Browse, search, and filter outfits and pieces even before importing wardrobe data. Collection status is shown as “Unknown”; import your data to view ownership and collection progress.'
    },
    {
      title: 'Added more game version 3.0 resources.',
      text: 'Updated clothing, outfits, makeup, photo actions, and avatar frame resources, with improved part classification and evolution form recognition for newly added clothing.'
    },
    {
      title: 'Improved guidance for transferring data between devices and browsers.',
      text: 'Empty modules on mobile now include data transfer instructions. On your original device or browser, select “More” → “Export all data” to export a backup, then select “More” → “Import all data” in the new browser to complete the transfer.'
    }
  ],
  historyTitle: 'Previous releases',
  history: [
    {
      version: 'v3.0',
      date: '2026.11.27',
      items: [
        {
          title: 'A new desktop home page.',
          text: "An immersive home page welcomes you by your character's nickname, with gentle entrance animations to make the site feel more personal."
        },
        {
          title: 'Choose your own home wallpaper.',
          text: 'Choose a preset or upload, drag in, or paste your own image. Adjust background blur and text lightness. The new interactive water ripple effect is enabled by default and can be turned off.'
        },
        {
          title: 'Open game albums more easily.',
          text: "Authorize the game's X6Game folder to automatically find your high-quality Momo album and switch between account albums. Use Open standalone album for photos stored elsewhere. Improved permission recovery and timeout handling prompt you to select the folder again when access expires."
        },
        {
          title: 'Character profiles and avatar customization.',
          text: 'On desktop, authorize your game album and open the album menu at the top right to view your character. On mobile, open More and enter your UID at the top. View your nickname, avatar, level, and character creation time, then use Change avatar frame to apply an animated frame to your avatar on this site.'
        },
        {
          title: 'A dedicated Data backup page.',
          text: 'Data backup in the desktop sidebar now brings together automatic backups for outfits, home schemes, and camera parameters. The home page alerts you when backups are not enabled or need attention.'
        },
        {
          title: 'Drag the image preview toolbar.',
          text: 'On desktop, drag the image preview toolbar and release it to dock at the top or bottom. It partially hides to keep photos clear and expands when you hover over it.'
        },
        {
          title: 'Refined mobile navigation and interface details.',
          text: 'Selected mobile navigation icons now enlarge, with improved press and bounce feedback. Dialogs, buttons, and menus have a more consistent appearance.'
        },
        {
          title: 'Game version 3.0 content updates.',
          text: 'Lucky Pull Times has been updated for game version 3.0. Clothing and makeup catalogs and other resources for game version 3.0 will be added gradually.'
        },
        {
          title: 'The toolkit has a new address.',
          text: 'New address: nikkicube.pages.dev. Export all data from the old site before importing it into the new site; local data is not automatically shared between addresses.'
        }
      ]
    }
  ],
  dontShowAgain: "Don't show again for this version",
  dontShowEverAgain: "Don't show again",
  confirm: 'Got it',
  closeAria: 'Close release history'
}
