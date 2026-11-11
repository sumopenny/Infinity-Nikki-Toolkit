// 共鸣导入用的取 Cookie 脚本：书签脚本（拖到书签栏）与控制台脚本，内容参照上游共鸣录。
import { PEARPAL_REGIONS } from './pearpalRegions'

const PEARPAL_HOSTS = [
  ...new Set(Object.values(PEARPAL_REGIONS).map((config) => new URL(config.site).hostname))
]

/** 完整匹配节点中的 UID；textContent 可读取隐藏浮层，也支持拆分标签、全角冒号和换行。 */
const UID_SNIPPET =
  "(()=>{for(const el of document.querySelectorAll('div')){const uid=el.textContent?.trim().match(/^UID\\s*[:：]\\s*(\\d+)$/i)?.[1];if(uid)return uid}return ''})()"
/** 从 Cookie 中取 momoToken（对应 Momo Token 字段）。 */
const TOKEN_SNIPPET = 'document.cookie.match(/momoToken=([^;]+)/)?.[1]'
/** 从 Cookie 中取 momoNid（对应 Momo ID 字段）。 */
const ID_SNIPPET = 'document.cookie.match(/momoNid=([^;]+)/)?.[1]'

/** 控制台方法：按指定脚本读取首个以 UID: 开头的 div，输出凭据 JSON。 */
export const resonanceConsoleScript =
  "console.log(JSON.stringify({roleid:[...document.querySelectorAll('div')].find(el=>el.textContent.startsWith('UID:'))?.textContent.replace('UID:','').trim(),token:document.cookie.match(/momoToken=([^;]+)/)?.[1],id:document.cookie.match(/momoNid=([^;]+)/)?.[1]}));"

/**
 * 书签方法：拖到书签栏后在美鸭梨站点点击执行。
 * 非美鸭梨站点会弹窗提示，避免在别的网站误用。
 */
export function resonanceBookmarkScript(invalidSiteMessage: string): string {
  return (
    'javascript:(function(){if(!' +
    JSON.stringify(PEARPAL_HOSTS) +
    '.includes(location.hostname)){alert(' +
    JSON.stringify(invalidSiteMessage) +
    ');return}const credentials={roleid:' +
    UID_SNIPPET +
    ',token:' +
    TOKEN_SNIPPET +
    ',id:' +
    ID_SNIPPET +
    '};prompt("Cookie:",JSON.stringify(credentials));})();'
  )
}

/**
 * 解析用户粘贴的 Cookie 文本。
 * 接受书签/控制台输出的 `{"roleid":...,"token":...,"id":...}` JSON；缺少 UID 时 roleid 为空字符串。
 */
export function parseResonanceCookie(text: string): { roleid: string; token: string; id: string } {
  if (!text.trim()) throw new Error('empty')
  // 上游输入框的占位示例使用单引号，先统一成合法 JSON 再解析。
  const parsed = JSON.parse(text.trim().replace(/'/g, '"')) as Record<string, unknown>
  const token = typeof parsed.token === 'string' ? parsed.token.trim() : ''
  const id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
  if (!token || !id) throw new Error('invalid')
  const roleid =
    parsed.roleid === null || parsed.roleid === undefined ? '' : String(parsed.roleid).trim()
  return { roleid, token, id }
}

export const PEARPAL_USERSCRIPT_PATH = '/scripts/pearpal-cookie.user.js'

/** 仅在官方页面添加按钮；缺少 UID 时尝试展开菜单，从页面读取并复制凭据。 */
export function resonanceUserscript(): string {
  return `// ==UserScript==
// @name         美鸭梨 / Pear-Pal Cookie 助手
// @author       素茉penny
// @namespace    infinity-nikki-toolkit
// @homepageURL  https://nikki3.pages.dev/
// @version      1.0.2
// @description  点击按钮复制登录凭据，返回 Infinity Nikki Toolkit 粘贴导入。工具网址：https://infinity-nikki-album-manager.pages.dev/
// @match        https://myl.nuanpaper.com/*
// @match        https://pearpal.infoldgames.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (
    window.top !== window.self ||
    !${JSON.stringify(PEARPAL_HOSTS)}.includes(location.hostname)
  ) return;
  if (document.getElementById('nikki-pearpal-cookie-button')) return;
  const zh = (navigator.language || '').toLowerCase().startsWith('zh');
  const button = document.createElement('button');
  button.id = 'nikki-pearpal-cookie-button';
  button.type = 'button';
  const label = zh ? '获取 Cookie' : 'Get Cookie';
  button.textContent = label;
  Object.assign(button.style, {
    position: 'fixed',
    right: '16px',
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    zIndex: '2147483647',
    padding: '12px 16px',
    border: '1px solid #fff',
    borderRadius: '12px',
    background: '#333',
    color: '#fff',
    font: '600 14px sans-serif',
    boxShadow: '0 2px 12px #0004',
    maxWidth: 'calc(100vw - 32px)',
    cursor: 'pointer'
  });
  // 每次面板持有一份快照；再次复制不重读页面，关闭时移除完整数据。
  function showResult(credentials) {
    const value = JSON.stringify(credentials);
    const host = document.createElement('div');
    host.id = 'nikki-pearpal-cookie-result';
    Object.assign(host.style, {
      position: 'fixed',
      right: 'max(16px, env(safe-area-inset-right, 0px))',
      bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
      width: '360px',
      maxWidth: 'calc(100vw - 32px)',
      zIndex: '2147483647'
    });
    // 隔离官方网页样式；完整 JSON 仅在用户主动展开时写入文本框。
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      ':host { color-scheme: light; text-align: left; }',
      '* { box-sizing: border-box; }',
      'section { padding: 20px; border-radius: 16px; background: #fff; color: #302b2e; box-shadow: 0 8px 32px #0003; font: 14px/1.6 system-ui, sans-serif; max-height: calc(100vh - 120px); max-height: calc(100dvh - 120px); overflow-y: auto; overflow-wrap: anywhere; }',
      'h2 { margin: 0 0 16px; font-size: 17px; line-height: 1.4; }',
      'dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; margin: 0 0 16px; }',
      'dt { color: #655960; } dd { margin: 0; font-variant-numeric: tabular-nums; }',
      'p { margin: 0 0 12px; } .privacy { font-size: 12px; color: #655960; }',
      '.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }',
      'button { min-height: 44px; padding: 8px 12px; border: 1px solid #d8ccd2; border-radius: 8px; background: #fff; color: #302b2e; font: inherit; cursor: pointer; }',
      'button:hover { background: #f5eff2; } button:disabled { opacity: .6; cursor: wait; }',
      'button:focus-visible, textarea:focus-visible { outline: 2px solid #79546b; outline-offset: 2px; }',
      'textarea { display: block; width: 100%; margin-top: 12px; padding: 10px; border: 1px solid #d8ccd2; border-radius: 8px; background: #faf7f9; color: #302b2e; font: 13px/1.6 monospace; resize: vertical; }',
      '[hidden] { display: none; }'
    ].join(' ');
    root.appendChild(style);
    const panel = document.createElement('section');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', zh ? '复制的登录凭据' : 'Copied sign-in credentials');
    const title = document.createElement('h2');
    title.setAttribute('role', 'status');
    title.setAttribute('aria-live', 'polite');
    title.textContent = zh ? '正在复制登录凭据…' : 'Copying sign-in credentials…';
    panel.appendChild(title);
    const fields = document.createElement('dl');
    for (const [key, name] of [
      ['roleid', zh ? '游戏 UID' : 'Game UID'],
      ['id', zh ? '账号 ID' : 'Account ID'],
      ['token', zh ? '登录令牌' : 'Sign-in token']
    ]) {
      const term = document.createElement('dt');
      term.textContent = name;
      const description = document.createElement('dd');
      description.textContent = (credentials[key].length > 5 ? credentials[key].slice(0, 5) : '') + '••••';
      fields.append(term, description);
    }
    panel.appendChild(fields);
    const privacy = document.createElement('p');
    privacy.className = 'privacy';
    privacy.textContent = zh ? '三个字段均已遮挡，保护隐私。' : 'All three fields are masked for privacy.';
    const detail = document.createElement('p');
    const nextStep = document.createElement('p');
    nextStep.textContent = zh
      ? '返回暖立方，粘贴到“导入数据”的凭据输入框。'
      : 'Return to Nikki Toolkit and paste into the credentials field in “Import data”.';
    panel.append(privacy, detail, nextStep);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = zh ? '再次复制' : 'Copy again';
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = zh ? '查看完整 JSON' : 'View full JSON';
    reveal.setAttribute('aria-expanded', 'false');
    reveal.setAttribute('aria-controls', 'credentials-json');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = zh ? '关闭' : 'Close';
    actions.append(retry, reveal, close);
    const full = document.createElement('textarea');
    full.id = 'credentials-json';
    full.readOnly = true;
    full.rows = 5;
    full.hidden = true;
    full.spellcheck = false;
    full.setAttribute('aria-label', zh ? '完整登录凭据 JSON' : 'Complete sign-in credentials JSON');
    reveal.addEventListener('click', () => {
      full.hidden = !full.hidden;
      full.value = full.hidden ? '' : value;
      reveal.setAttribute('aria-expanded', String(!full.hidden));
      reveal.textContent = full.hidden
        ? (zh ? '查看完整 JSON' : 'View full JSON')
        : (zh ? '收起完整 JSON' : 'Hide full JSON');
      if (!full.hidden) { full.focus(); full.select(); }
    });
    function dismiss() {
      full.value = '';
      host.remove();
      button.focus({ preventScroll: true });
    }
    close.addEventListener('click', dismiss);
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
    });
    async function copy() {
      retry.disabled = true;
      title.textContent = zh ? '正在复制登录凭据…' : 'Copying sign-in credentials…';
      detail.textContent = '';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(value);
        if (!host.isConnected) return;
        title.textContent = zh ? '✓ 登录凭据已复制' : '✓ Sign-in credentials copied';
        detail.textContent = zh
          ? '剪贴板中是包含 roleid、token、id 三项的完整 JSON。'
          : 'The clipboard contains the complete JSON with roleid, token and id.';
      } catch {
        if (!host.isConnected) return;
        title.textContent = zh ? '未能自动复制' : 'Could not copy automatically';
        detail.textContent = zh
          ? '点击“查看完整 JSON”，手动复制全部内容；也可以点击“再次复制”重试。'
          : 'Choose “View full JSON” to copy all the text manually, or choose “Copy again” to retry.';
      } finally {
        retry.disabled = false;
      }
    }
    retry.addEventListener('click', () => { void copy(); });
    panel.append(actions, full);
    root.appendChild(panel);
    document.body.appendChild(host);
    return copy();
  }
  // 手机侧边栏可能在展开时才挂载 UID；先监听再点击，兼容同步和延迟渲染。
  function openMenuAndReadUid() {
    const selector = '[class*="TopBar_tab-menu-icon__"]';
    const target = document.evaluate(
      '//*[@id="__next"]/div[1]/div/div[1]/div[1]/div[1]',
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    const menu = target instanceof HTMLElement && target.matches(selector)
      ? target : document.querySelector(selector);
    if (!(menu instanceof HTMLElement) || getComputedStyle(menu).display === 'none') {
      return Promise.resolve('');
    }
    button.textContent = zh ? '正在展开菜单并读取 UID…' : 'Opening menu to read UID…';
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => finish(''), 5000);
      function cleanup() { observer.disconnect(); clearTimeout(timer); }
      function finish(uid) { cleanup(); resolve(uid); }
      function check() {
        const uid = ${UID_SNIPPET};
        if (uid) finish(uid);
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      try { menu.click(); check(); }
      catch (error) { cleanup(); reject(error); }
    });
  }
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    document.getElementById('nikki-pearpal-cookie-result')?.remove();
    button.disabled = true;
    button.textContent = label;
    try {
      const credentials = {
        roleid: ${UID_SNIPPET},
        token: ${TOKEN_SNIPPET},
        id: ${ID_SNIPPET}
      };
      if (!credentials.roleid && credentials.token && credentials.id) {
        credentials.roleid = await openMenuAndReadUid();
        // 等待期间登录状态可能变化，最终复制前重新读取 Cookie。
        credentials.token = ${TOKEN_SNIPPET};
        credentials.id = ${ID_SNIPPET};
      }
      if (!credentials.roleid || !credentials.token || !credentials.id) {
        button.textContent = zh ? '请先登录并确认角色' : 'Sign in and confirm your role';
        alert(zh
          ? '未读取到完整凭据，请确认已登录；若已登录，请手动展开左上角菜单，显示账号 UID 后重试。'
          : 'Complete credentials were not found. Confirm you are signed in; if already signed in, open the top-left menu to show your account UID and try again.');
        return;
      }
      button.textContent = label;
      await showResult(credentials);
    } catch {
      alert(zh ? '获取失败，请刷新页面后重试。' : 'Could not get credentials. Refresh and try again.');
    } finally {
      button.disabled = false;
    }
  });
  document.body.appendChild(button);
})();
`
}
