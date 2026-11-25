function account(uid: string, nickname?: string | null) {
  return nickname ? `${nickname} · UID ${uid}` : `UID ${uid}`
}

export const gameAlbumMessages = {
  zh: {
    authorize: '授权X6Game',
    reselect: '重新选择X6Game',
    authorizeTools: '授权 X6Game',
    reauthorizeTools: '重新授权 X6Game',
    restore: '恢复上次授权',
    restoreHint: '恢复上次授权后，即可继续打开相册。',
    restoreTimeout:
      '已保存的目录授权查询超时，请重新选择目录：游戏相册请选择 X6Game，独立相册请重新打开原文件夹。',
    authorizationPath: '推荐授权路径：...\\InfinityNikki Launcher\\InfinityNikki\\X6Game',
    noAccounts: '这个 X6Game 中没有可打开的高画质相册。请确认游戏内已经拍过照。',
    missingAccount: '该账号的高画质相册已找不到。可切换到其他可用账号，或重新选择X6Game。',
    account,
    switchAccount: '切换账号',
    pickerAborted: '未打开 X6Game。如选择器无法访问此目录，可以用只读兼容模式打开相册。',
    restoreFailed: '未恢复上次授权。可以重试或重新选择目录。',
    changeViaAlbum: '请从当前相册菜单「重新选择X6Game」，同时更新游戏相册和工具的目录。'
  },
  en: {
    authorize: 'Authorize X6Game',
    reselect: 'Choose another X6Game',
    authorizeTools: 'Authorize X6Game',
    reauthorizeTools: 'Reauthorize X6Game',
    restore: 'Restore previous access',
    restoreHint: 'Restore access to reopen your last album.',
    restoreTimeout:
      'Checking saved folder access timed out. Select the folder again: choose X6Game for a game album, or reopen the original folder for a standalone album.',
    authorizationPath:
      'Recommended authorization path: ...\\InfinityNikki Launcher\\InfinityNikki\\X6Game',
    noAccounts:
      'No high-quality albums were found in this X6Game folder. Take a photo in the game first.',
    missingAccount:
      'This high-quality album is missing. Switch to an available account or choose another X6Game folder.',
    account,
    switchAccount: 'Switch account',
    pickerAborted:
      'X6Game was not opened. If the picker cannot access this folder, try read-only compatibility mode.',
    restoreFailed: 'Access was not restored. Try again or choose another folder.',
    changeViaAlbum:
      'Choose another X6Game from the current album menu to update the folder for both the album and tools.'
  }
}
