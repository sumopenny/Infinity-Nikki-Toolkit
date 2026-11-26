<script setup lang="ts">
import { CircleUserRound } from 'lucide-vue-next'
import { computed, ref, shallowRef, watch, watchEffect } from 'vue'
import { useAnimatedHeadFrame } from '../composables/useAnimatedHeadFrame'
import { headFrames } from '../utils/animatedHeadFrames'
import { avatarCanvasSize, drawAvatar } from '../utils/avatarSimulator'
import { useProfileAvatar } from '../composables/useProfileAvatar'
import type { GameAlbumProfile } from '../composables/useGameAlbumProfiles'
import type { Language } from '../i18n'
import { gameAlbumMessages } from '../i18n/messages/gameAlbum'

const props = defineProps<{
  uid: string
  profile?: GameAlbumProfile
  language: Language
}>()

const emit = defineEmits<{ openAvatarSimulator: [] }>()

const copy = computed(() => gameAlbumMessages[props.language])
const { avatars, load } = useProfileAvatar()
watch(() => props.uid, load, { immediate: true })
const failedAvatarUrl = ref<string>()
const savedAvatar = computed(() => {
  const saved = avatars.get(props.uid)
  return saved?.image === failedAvatarUrl.value ? null : saved
})
const avatarUrl = computed(() => {
  const url = props.profile?.avatarUrl
  return url === failedAvatarUrl.value ? null : url
})
const animation = computed(() => headFrames[savedAvatar.value?.frameId ?? '']?.animation)
const photo = shallowRef<HTMLImageElement | null>(null)
const animatedAvatar = ref<HTMLCanvasElement | null>(null)
watch(
  [avatarUrl, animation],
  async ([url, frame], _, cleanup) => {
    photo.value = null
    if (!url || !frame) return
    let stale = false
    const image = new Image()
    cleanup(() => {
      stale = true
      image.removeAttribute('src')
    })
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    image.src = url
    try {
      await image.decode()
      if (!stale) photo.value = image
    } catch {
      // Keep the saved preview when the original photo cannot be loaded.
    }
  },
  { immediate: true }
)
const { canvas: frameCanvas } = useAnimatedHeadFrame(
  animation,
  () => !!photo.value,
  () => 0,
  repaintAvatar
)
const animationReady = computed(() => !!photo.value && !!frameCanvas.value)
function repaintAvatar() {
  const canvas = animatedAvatar.value
  const saved = savedAvatar.value
  if (!canvas || !saved || !photo.value || !frameCanvas.value) return
  const scale = canvas.width / avatarCanvasSize
  canvas.getContext('2d')!.setTransform(scale, 0, 0, scale, 0, 0)
  drawAvatar(
    canvas,
    photo.value,
    frameCanvas.value,
    saved.zoom,
    saved.x,
    saved.y,
    true,
    animation.value?.photoCrop
  )
}
watchEffect(repaintAvatar, { flush: 'post' })
const profileTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})
const profileTimes = computed(() => [
  { label: copy.value.profileCreatedAt, value: props.profile?.createdAt },
  { label: copy.value.profileUpdatedAt, value: props.profile?.updatedAt }
])

function formatProfileTime(value: string) {
  return profileTimeFormatter.format(new Date(value)).replaceAll('/', '-')
}

function onAvatarError(event: Event) {
  failedAvatarUrl.value = (event.currentTarget as HTMLImageElement).src
}
</script>

<template>
  <section class="album-profile" :aria-label="copy.profile">
    <div class="album-profile-identity">
      <div class="album-profile-avatar" :class="{ 'has-frame': savedAvatar }">
        <canvas
          v-if="animation"
          v-show="animationReady"
          ref="animatedAvatar"
          width="256"
          height="256"
          aria-hidden="true"
        />
        <img
          v-if="savedAvatar"
          v-show="!animationReady"
          :src="savedAvatar.image"
          alt=""
          @error="onAvatarError"
        />
        <img
          v-else-if="avatarUrl"
          :key="avatarUrl"
          :src="avatarUrl"
          alt=""
          referrerpolicy="no-referrer"
          decoding="async"
          @error="onAvatarError"
        />
        <CircleUserRound v-else :size="26" aria-hidden="true" />
      </div>
      <div class="album-profile-name-group">
        <p class="album-profile-name">
          <span>{{ profile?.nickname || copy.account(uid) }}</span>
          <span v-if="profile?.level != null" class="album-profile-level">
            {{ copy.profileLevel(profile.level) }}
          </span>
        </p>
        <div class="album-profile-details">
          <p v-if="profile?.nickname" class="album-profile-uid">{{ copy.account(uid) }}</p>
          <button
            type="button"
            class="album-profile-frame-button"
            @click="emit('openAvatarSimulator')"
          >
            {{ copy.changeAvatarFrame }}
          </button>
        </div>
      </div>
    </div>
    <dl class="album-profile-times">
      <div v-for="{ label, value } in profileTimes" :key="label">
        <dt>{{ label }}</dt>
        <dd>
          <time v-if="value" :datetime="value">{{ formatProfileTime(value) }}</time>
          <span v-else>{{ copy.profileUnknown }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.album-profile {
  margin-bottom: 4px;
  padding: 16px 10px;
  border-bottom: 1px solid var(--line);
  text-align: center;
}

.album-profile-identity {
  display: flex;
  align-items: center;
  gap: 16px;
  text-align: left;
}

.album-profile-avatar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  box-sizing: border-box;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface-accent-subtle);
  color: var(--menu-hover-text);
}

.album-profile-avatar img,
.album-profile-avatar canvas {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.album-profile-avatar.has-frame {
  border-color: transparent;
  background: transparent;
}

.album-profile-avatar.has-frame img,
.album-profile-avatar.has-frame canvas {
  /* Transparent canvas margins extend beyond the original 64px avatar slot. */
  position: absolute;
  top: 50%;
  left: 50%;
  width: 108px;
  height: 108px;
  max-width: none;
  transform: translate(-50%, -50%);
  pointer-events: none;
  border-radius: 0;
  object-fit: contain;
}

.album-profile-level {
  padding: 2px 9px;
  border: 1px solid var(--accent-border-subtle);
  border-radius: 999px;
  background: var(--surface);
  color: var(--menu-hover-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.album-profile-name-group {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.album-profile-name,
.album-profile-uid,
.album-profile-times {
  margin: 0;
}

.album-profile-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  color: var(--heading);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.5;
}

.album-profile-uid,
.album-profile-times dt {
  color: var(--text);
  font-size: 12px;
}

.album-profile-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 4px;
}

.album-profile .album-profile-frame-button {
  width: auto;
  min-height: 30px;
  margin-inline-start: auto;
  padding: 4px 8px;
  border: 1px solid var(--accent-border-subtle);
  border-radius: 10px;
  background: var(--surface);
  color: var(--menu-hover-text);
  font-size: 12px;
  line-height: 1.5;
}

.album-profile-times {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
  overflow-wrap: anywhere;
}

.album-profile-times > div {
  min-width: 0;
  padding: 10px 6px;
  border-radius: 12px;
  background: var(--surface-accent-subtle);
  line-height: 1.6;
}

.album-profile-times dd {
  margin: 3px 0 0;
  color: var(--heading);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
</style>
