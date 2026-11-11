import { spawn, execFileSync } from 'node:child_process'
// Start `npx vite --host 127.0.0.1 --port 5198 --strictPort`, then run this script on Windows with Edge installed.
import { writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
const root = process.cwd()
const folder = resolve(root, 'artifacts/album-performance')
await mkdir(folder, { recursive: true })
const temporary = [
  'src/components/PhotoGridBaseline.vue',
  'src/components/WindowedPhotoBatchBaseline.vue',
  '.tmp-album-benchmark.html'
]
const baseline = execFileSync('git', ['show', 'b596008:src/components/PhotoGrid.vue'], {
  encoding: 'utf8'
}).replace("'./WindowedPhotoBatch.vue'", "'./WindowedPhotoBatchBaseline.vue'")
await writeFile(temporary[0], baseline)
await writeFile(
  temporary[1],
  execFileSync('git', ['show', 'b596008:src/components/WindowedPhotoBatch.vue'])
)
await writeFile(
  temporary[2],
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
import { createApp, reactive, nextTick, h } from '/node_modules/.vite/deps/vue.js';
import Grid from '/src/components/PhotoGrid.vue';
import Baseline from '/src/components/PhotoGridBaseline.vue';
import { messages } from '/src/i18n/index.ts';
${['tokens', 'base', 'album', 'album-navigation', 'mobile', 'card-actions'].map((name) => `import '/src/styles/${name}.css';`).join('\n')}
document.body.style.cssText='display:block;padding:20px';
const urls=new Map(); const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);urls.set(url,blob.size);return url};
URL.revokeObjectURL=url=>{urls.delete(url);revoke(url)};
const errors=[]; addEventListener('error',e=>errors.push(e.message)); addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;
const ctx=canvas.getContext('2d'); const gradient=ctx.createLinearGradient(0,0,3840,2160);gradient.addColorStop(0,'#e6a4b4');gradient.addColorStop(1,'#435585');ctx.fillStyle=gradient;ctx.fillRect(0,0,3840,2160);
for(let i=0;i<150;i++){ctx.fillStyle='hsl('+i*29+' 60% 70%)';ctx.fillRect((i*179)%3800,(i*127)%2100,80,80)}
const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));canvas.width=canvas.height=0;
const photos=Array.from({length:600},(_,i)=>({id:String(i),name:i+'.jpg',source:'file',file:new File([blob],i+'.jpg'),url:null,fileSizeText:'--',dateKey:'2026-11-11',year:'2026',monthDay:'11/11',displayDate:'2026-11-11',timeText:'12:00',timestamp:i}));
const props=reactive({dateGroups:[{dateKey:'2026-11-11',year:'2026',monthDay:'11/11',displayDate:'2026-11-11',photos}],selectedIds:new Set(),favoriteIds:new Set(),thumbnailMode:'wide',thumbnailSize:'medium',isFavoritesView:false,messages:messages.zh.grid});
const baseline=new URLSearchParams(location.search).has('baseline'); const app=createApp({render:()=>h(baseline?Baseline:Grid,props)});app.mount('#app');
window.bench={photos,props,urls,errors,app,nextTick};window.ready=true;
</script></body></html>`
)
const profile = await mkdtemp(resolve(tmpdir(), 'nikki-album-bench-'))
const edge = spawn(
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-proxy-server',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9398',
    `--user-data-dir=${profile}`,
    'about:blank'
  ],
  { windowsHide: true, stdio: 'ignore' }
)
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
let ws
let closeBrowser
try {
  let targets
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch('http://127.0.0.1:9398/json')).json()
      break
    } catch {
      await delay(250)
    }
  }
  if (!targets) throw new Error('Headless Edge unavailable')
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data)
    if (result.id && pending.has(result.id)) {
      const { resolve, reject } = pending.get(result.id)
      pending.delete(result.id)
      result.error ? reject(result.error) : resolve(result.result)
    }
  })
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  closeBrowser = () => call('Browser.close')
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  })
  const results = {
    date: new Date().toISOString(),
    scenario:
      '600 synthetic 3840x2160 JPEG photos, one date, Edge headless 1280x800; 36 scroll steps, 250ms per step; development build',
    runs: []
  }
  for (const baseline of [true, false]) {
    await call('Page.navigate', {
      url: 'http://127.0.0.1:5198/.tmp-album-benchmark.html' + (baseline ? '?baseline' : '')
    })
    for (let i = 0; i < 100; i++) {
      if (await evaluate('window.ready===true')) break
      await delay(250)
    }
    if (!(await evaluate('window.ready===true')))
      throw new Error(
        'Benchmark page failed to initialize: ' + (await evaluate('document.body.innerText'))
      )
    await delay(1800)
    const initial = await evaluate(
      '({loaded:document.querySelectorAll(".is-loaded").length,urls:bench.urls.size})'
    )
    const measurements = await evaluate(
      `(async()=>{const tasks=[];const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'});const samples=[];for(let i=0;i<36;i++){scrollTo(0,i*650);await new Promise(r=>setTimeout(r,250));samples.push({cards:document.querySelectorAll('.photo-card').length,urls:bench.urls.size,bytes:[...bench.urls.values()].reduce((a,b)=>a+b,0)});}await new Promise(r=>setTimeout(r,1500));observer.disconnect();return{peakCards:Math.max(...samples.map(s=>s.cards)),peakUrls:Math.max(...samples.map(s=>s.urls)),peakBlobBytes:Math.max(...samples.map(s=>s.bytes)),finalUrls:bench.urls.size,originalUrls:bench.photos.filter(p=>p.url).length,longTasks:tasks.length,totalLongTaskMs:Math.round(tasks.reduce((a,b)=>a+b,0)),maxLongTaskMs:Math.round(Math.max(0,...tasks)),errors:bench.errors,displayedDimensions:[...document.images].filter(i=>i.naturalWidth).slice(0,3).map(i=>[i.naturalWidth,i.naturalHeight])}})()`
    )
    await evaluate('scrollTo(0,0)')
    await delay(1000)
    const returned = await evaluate(
      '({loaded:document.querySelectorAll(".is-loaded").length,failed:document.querySelectorAll(".is-failed").length})'
    )
    let additionalChecks
    if (!baseline) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true
      })
      await evaluate(
        "bench.props.thumbnailSize='small';bench.props.thumbnailMode='portrait-wide';bench.props.selectedIds=new Set(['0']);bench.props.favoriteIds=new Set(['0'])"
      )
      await delay(2500)
      const mobile = await evaluate(
        `({failed:document.querySelectorAll('.is-failed').length,selected:document.querySelector('[aria-pressed="true"]')!==null,imageSize:[document.querySelector('.is-loaded img')?.naturalWidth,document.querySelector('.is-loaded img')?.naturalHeight],height:document.documentElement.scrollHeight})`
      )
      await evaluate(
        `bench.props.dateGroups=Array.from({length:100},(_,i)=>({dateKey:'date-'+i,year:'2026',monthDay:String(i),displayDate:'date '+i,photos:bench.photos.slice(i*6,i*6+6)}))`
      )
      await delay(1500)
      const grouped = await evaluate(
        `({groups:document.querySelectorAll('.date-block').length,cards:document.querySelectorAll('.photo-card').length,failed:document.querySelectorAll('.is-failed').length})`
      )
      if (grouped.groups !== 100 || mobile.imageSize[0] !== 512 || mobile.failed)
        throw new Error('Layout regression: ' + JSON.stringify({ mobile, grouped }))
      await evaluate(
        `bench.props.dateGroups=[{dateKey:'replacement',year:'2026',monthDay:'11/11',displayDate:'replacement',photos:bench.photos.slice(590)}];scrollTo(0,0)`
      )
      await delay(1500)
      additionalChecks = {
        mobile,
        grouped,
        replaced: await evaluate(
          `({groups:document.querySelectorAll('.date-block').length,failed:document.querySelectorAll('.is-failed').length,urls:bench.urls.size,errors:bench.errors})`
        )
      }
      console.log(JSON.stringify(additionalChecks))
      // A retained photo may have small, medium and large cached versions.
      if (additionalChecks.replaced.urls > 30)
        throw new Error('Stale photo cache was retained: ' + JSON.stringify(additionalChecks))
    }
    await evaluate('bench.app.unmount()')
    await delay(500)
    const unmountedUrls = await evaluate('bench.urls.size')
    results.runs.push({
      baseline,
      initial,
      ...measurements,
      returned,
      additionalChecks,
      unmountedUrls
    })
    await writeFile(resolve(folder, 'benchmark.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results.runs.at(-1)))
  }
} finally {
  await Promise.race([closeBrowser?.().catch(() => {}), delay(1000)])
  ws?.close()
  edge.kill()
  await delay(500)
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(
    () => {}
  )
  for (const file of temporary) await rm(resolve(root, file), { force: true })
}
