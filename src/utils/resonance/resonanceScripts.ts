// 共鸣导入用的取 Cookie 脚本：书签脚本（拖到书签栏）与控制台脚本，内容参照上游共鸣录。
import { PEARPAL_REGIONS } from './pearpalRegions'

/** 手机页面可能拆分标签、使用全角冒号或换行；只提取明确标注为 UID 的数字。 */
const UID_SNIPPET =
  "(document.body.innerText||document.body.textContent||'').match(/\\bUID\\s*[:：]\\s*(\\d+)\\b/i)?.[1]||''"
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
  // 书签可跨区服复用，只向当前官方站点对应的接口发送凭据。
  const sites = Object.fromEntries(
    Object.values(PEARPAL_REGIONS).map((config) => [
      new URL(config.site).hostname,
      {
        api: config.api,
        clientId: config.clientId,
        zones: Object.values(PEARPAL_REGIONS)
          .filter((entry) => entry.site === config.site)
          .map((entry) => entry.zoneId)
      }
    ])
  )
  return (
    'javascript:(async function(){const sites=' +
    JSON.stringify(sites) +
    ';const config=Object.hasOwn(sites,location.hostname)?sites[location.hostname]:null;if(!config){alert(' +
    JSON.stringify(invalidSiteMessage) +
    ');return}const credentials={roleid:' +
    UID_SNIPPET +
    ',token:' +
    TOKEN_SNIPPET +
    ',id:' +
    ID_SNIPPET +
    '};if(!credentials.roleid&&credentials.token&&credentials.id){try{' +
    'const response=await fetch(config.api+"/v1/strategy/user/info/get",{' +
    'method:"POST",headers:{"content-type":"application/json"},cache:"no-store",' +
    'body:JSON.stringify({client_id:config.clientId,token:credentials.token,openid:credentials.id})});' +
    'if(response.ok){const payload=await response.json();const role=payload.data?.role;' +
    'if(payload.code===0&&role&&((role.zone_id===undefined&&config.clientId===1106)||config.zones.includes(Number(role.zone_id)))&&/^\\d+$/.test(String(role.uid??"")))' +
    'credentials.roleid=String(role.uid);}}catch{}}' +
    'prompt("Cookie:",JSON.stringify(credentials));})();'
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

/** 用户脚本专用：校验官方登录状态后交给复制逻辑处理。 */
function userscriptCredentialScript(invalidSiteMessage: string, output: string): string {
  // 只向当前官方站点对应的接口发送凭据。
  const sites = Object.fromEntries(
    Object.values(PEARPAL_REGIONS).map((config) => [
      new URL(config.site).hostname,
      {
        api: config.api,
        clientId: config.clientId,
        zones: Object.values(PEARPAL_REGIONS)
          .filter((entry) => entry.site === config.site)
          .map((entry) => entry.zoneId)
      }
    ])
  )
  return `(async function () {
  const sites = ${JSON.stringify(sites, null, 2).replaceAll('\n', '\n  ')};
  const config = Object.hasOwn(sites, location.hostname) ? sites[location.hostname] : null;
  if (!config) {
    alert(${JSON.stringify(invalidSiteMessage)});
    return;
  }

  const credentials = {
    roleid: ${UID_SNIPPET},
    token: ${TOKEN_SNIPPET},
    id: ${ID_SNIPPET}
  };

  let verification = 'missing';
  // 用户脚本始终校验官方登录状态，不信任退出后残留的 Cookie 或页面 UID。
  if (credentials.token && credentials.id) {
    verification = 'network';
    try {
      const response = await fetch(config.api + '/v1/strategy/user/info/get', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          client_id: config.clientId,
          token: credentials.token,
          openid: credentials.id
        })
      });
      if (response.ok) {
        const payload = await response.json();
        const role = payload.data?.role;
        verification = 'auth';
        if (
          payload.code === 0 && role &&
          ((role.zone_id === undefined && config.clientId === 1106) ||
            config.zones.includes(Number(role.zone_id))) &&
          /^\\d+$/.test(String(role.uid ?? ''))
        ) {
          credentials.roleid = String(role.uid);
          verification = 'valid';
        }
      }
    } catch {
      // 网络或解析失败交给后续验证提示处理。
    }
  }

  ${output.replaceAll('\n', '\n  ')}
})();`
}

export const PEARPAL_USERSCRIPT_PATH = '/scripts/pearpal-cookie.user.js'

/** 仅在官方页面添加按钮；用户点击后才读取和复制凭据，不自动向工具回传。 */
export function resonanceUserscript(): string {
  const run = userscriptCredentialScript(
    '请在美鸭梨或 Pear-Pal 网站使用此脚本。 / Open Pear-Pal to use this script.',
    `if (verification === 'network') {
  button.textContent = zh ? '验证失败，请重试' : 'Verification failed';
  alert(zh ? '无法验证登录状态，请检查网络后重试。' : 'Could not verify sign-in. Check your connection and try again.');
  return;
}
if (verification !== 'valid') {
  button.textContent = zh ? '请先登录' : 'Sign in first';
  alert(zh
    ? '当前未登录、登录已失效或未获取到角色，请在当前美鸭梨 / Pear-Pal 页面重新登录并确认角色后，再次点击“获取 Cookie”。'
    : 'Sign-in is missing or expired, or no role was found. Sign in again on Pear-Pal and confirm your role, then tap “Get Cookie” again.');
  return;
}

const value = JSON.stringify(credentials);
try {
  if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
  await navigator.clipboard.writeText(value);
  button.textContent = zh ? '已复制，返回工具粘贴' : 'Copied — paste in the toolkit';
} catch {
  prompt(
    zh
      ? '请完整复制下方 JSON，包含 roleid、token、id 三项及外层大括号、双引号，然后返回工具粘贴：'
      : 'Copy the complete JSON below, including roleid, token, id, braces and double quotes, then paste it in the toolkit:',
    value
  );
}`
  )
  return `// ==UserScript==
// @name         美鸭梨 / Pear-Pal Cookie 助手
// @namespace    infinity-nikki-toolkit
// @homepageURL  https://nikki3.pages.dev/
// @version      1.0.0
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
    !['myl.nuanpaper.com', 'pearpal.infoldgames.com'].includes(location.hostname)
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
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = label;
    try {
      await ${run.replaceAll('\n', '\n      ')}
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
