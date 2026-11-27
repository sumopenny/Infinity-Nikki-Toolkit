import { shallowRef, ref, watch, type WatchSource } from 'vue'
import type { SpinePlayer } from '@esotericsoftware/spine-player'
import {
  headFramePlayerAssets,
  headFrameViewport,
  type AnimatedHeadFrame
} from '../utils/animatedHeadFrames'

/** 只为选中的头像框创建播放器；将透明动画帧合成到现有头像画布，保存仍为当前帧 PNG。 */
export function useAnimatedHeadFrame(
  selection: WatchSource<AnimatedHeadFrame | undefined>,
  active: WatchSource<boolean>,
  retry: WatchSource<number>,
  repaint: () => void
) {
  const canvas = shallowRef<HTMLCanvasElement | null>(null)
  const failed = ref(false)
  const paused = ref(false)
  let player: SpinePlayer | undefined

  watch(
    [selection, active, retry],
    async ([frame, enabled], _, cleanup) => {
      canvas.value = null
      failed.value = false
      paused.value = false
      if (!frame || !enabled) return

      let stale = false
      let instance: SpinePlayer | undefined
      let host: HTMLDivElement | undefined
      const controller = new AbortController()
      const timeout = window.setTimeout(() => fail(), 30000)
      const release = () => {
        window.clearTimeout(timeout)
        controller.abort()
        const gl = instance?.context?.gl
        instance?.dispose()
        // 连续切换时立即释放 WebGL 上下文，避免触及浏览器的活跃上下文数量上限。
        gl?.getExtension('WEBGL_lose_context')?.loseContext()
        if (player === instance) player = undefined
        instance = undefined
        host?.remove()
      }
      const fail = () => {
        if (stale) return
        failed.value = true
        canvas.value = null
        // 错误可能发生在播放器构造期间，推迟释放，确保实例已经赋值。
        queueMicrotask(release)
        repaint()
      }
      cleanup(() => {
        stale = true
        release()
      })

      try {
        const { SpinePlayer } = await import('@esotericsoftware/spine-player')
        if (stale || failed.value) return
        // 先校验 JSON，避免播放器将网络失败的空响应当作成功并在异步回调中抛错。
        const assets = headFramePlayerAssets(frame)
        const response = await fetch(assets.jsonUrl, { signal: controller.signal })
        if (!response.ok) throw new Error('Head frame resource unavailable')
        const skeleton = await response.json()
        if (!skeleton || typeof skeleton !== 'object' || !Array.isArray(skeleton.bones))
          throw new Error('Invalid head frame skeleton')
        if (stale || failed.value) return
        host = document.createElement('div')
        host.setAttribute('aria-hidden', 'true')
        host.style.cssText =
          'position:fixed;left:-10000px;top:0;width:512px;height:512px;pointer-events:none'
        document.body.append(host)
        instance = new SpinePlayer(host, {
          ...assets,
          rawDataURIs: {
            ...assets.rawDataURIs,
            [assets.jsonUrl]: 'data:application/json,' + JSON.stringify(skeleton)
          },
          animation: frame.defaultAnimation,
          alpha: true,
          backgroundColor: '#00000000',
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          showControls: false,
          showLoading: false,
          // 固定扩展原画板四边，保留动画外围装饰，避免视口随动画抖动。
          viewport: headFrameViewport(frame),
          success: (p) => {
            if (stale || failed.value) return
            p.setAnimation(frame.defaultAnimation, true)
            p.play()
          },
          error: fail,
          // draw 在 WebGL 绘制后执行，避免复制到上一帧或尚未绘制的透明画布。
          draw: (p) => {
            if (stale || failed.value) return
            window.clearTimeout(timeout)
            canvas.value = p.canvas
            repaint()
          }
        })
        player = instance
      } catch {
        fail()
      }
    },
    { immediate: true, flush: 'post' }
  )

  function togglePause() {
    if (!player || !canvas.value) return
    paused.value = !paused.value
    if (paused.value) player.pause()
    else player.play()
  }

  return { canvas, failed, paused, togglePause }
}
