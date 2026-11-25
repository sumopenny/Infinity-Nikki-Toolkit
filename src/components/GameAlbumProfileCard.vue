<script setup lang="ts">
import { CircleUserRound } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { GameAlbumProfile } from '../composables/useGameAlbumProfiles'
import type { Language } from '../i18n'
import { gameAlbumMessages } from '../i18n/messages/gameAlbum'

const props = defineProps<{
  uid: string
  profile?: GameAlbumProfile
  language: Language
}>()

const copy = computed(() => gameAlbumMessages[props.language])
const failedAvatarUrl = ref<string>()
const avatarUrl = computed(() => {
  const url = props.profile?.avatarUrl
  return url === failedAvatarUrl.value ? null : url
})
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
      <div class="album-profile-avatar">
        <img
          v-if="avatarUrl"
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
        <p v-if="profile?.nickname" class="album-profile-uid">{{ copy.account(uid) }}</p>
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
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
}

.album-profile-identity {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 16px;
}

.album-profile-avatar {
  display: grid;
  box-sizing: border-box;
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface-accent-subtle);
  color: var(--menu-hover-text);
}

.album-profile-avatar img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.album-profile-level {
  margin-inline-start: 6px;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.album-profile-name-group {
  min-width: 0;
  overflow-wrap: anywhere;
}

.album-profile-name,
.album-profile-uid,
.album-profile-times {
  margin: 0;
}

.album-profile-name {
  color: var(--heading);
  font-size: 16px;
  font-weight: 700;
}

.album-profile-uid,
.album-profile-times dt {
  color: var(--text);
  font-size: 12px;
}

.album-profile-uid {
  margin-top: 2px;
}

.album-profile-times {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
  overflow-wrap: anywhere;
}

.album-profile-times dd {
  margin: 3px 0 0;
  color: var(--heading);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
</style>
