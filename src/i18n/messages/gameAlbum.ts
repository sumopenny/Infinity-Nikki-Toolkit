export const gameAlbumMessages = {
  zh: {
    authorize: '授权X6Game',
    reselect: '重新选择X6Game',
    restore: '恢复上次授权',
    restoreHint: '恢复上次授权后，即可继续打开相册。',
    chooseHint: '请选择游戏安装目录下的 X6Game 文件夹。',
    path: '…\\InfinityNikki Launcher\\InfinityNikki\\X6Game',
    noAccounts: '这个 X6Game 中没有可打开的高画质相册。请确认游戏内已经拍过照。',
    missingAccount: '上次打开的账号相册已找不到。请选择另一个账号或重新选择X6Game。',
    currentAccount: (uid: string) => `当前 UID ${uid}`,
    accountLabel: '游戏账号',
    chooseAccount: '选择游戏账号',
    switchAccount: '切换账号',
    accountHint: '请选择要打开的高画质相册。',
    open: '打开相册',
    pickerAborted: '未打开 X6Game。如选择器无法访问此目录，可以用只读兼容模式打开相册。',
    restoreFailed: '未恢复上次授权。可以重试或重新选择目录。',
    changeViaAlbum: '请从当前相册菜单「重新选择X6Game」，同时更新游戏相册和工具的目录。'
  },
  en: {
    authorize: 'Authorize X6Game',
    reselect: 'Choose another X6Game',
    restore: 'Restore previous access',
    restoreHint: 'Restore access to reopen your last album.',
    chooseHint: 'Select the X6Game folder in your game installation.',
    path: '…\\InfinityNikki Launcher\\InfinityNikki\\X6Game',
    noAccounts:
      'No high-quality albums were found in this X6Game folder. Take a photo in the game first.',
    missingAccount: 'The previous album is missing. Choose another account or X6Game folder.',
    currentAccount: (uid: string) => `Current UID ${uid}`,
    accountLabel: 'Game account',
    chooseAccount: 'Choose a game account',
    switchAccount: 'Switch account',
    accountHint: 'Choose the high-quality album to open.',
    open: 'Open album',
    pickerAborted:
      'X6Game was not opened. If the picker cannot access this folder, try read-only compatibility mode.',
    restoreFailed: 'Access was not restored. Try again or choose another folder.',
    changeViaAlbum:
      'Choose another X6Game from the current album menu to update the folder for both the album and tools.'
  }
}
