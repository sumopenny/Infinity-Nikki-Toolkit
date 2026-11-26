<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { Language } from '../i18n'
import type { GameAlbumProfile } from '../composables/useGameAlbumProfiles'
import { readLocalStorage } from '../utils/localStorage'
import GameAlbumProfileCard from './GameAlbumProfileCard.vue'
import ProfileUidForm from './ProfileUidForm.vue'

const props = defineProps<{
  language: Language
  loadProfile: (uid: string) => Promise<GameAlbumProfile | null>
}>()
const emit = defineEmits<{ editAvatarFrame: [uid: string] }>()
const key = 'nikki-manual-profile-uid'
const validUid = (value: string) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0 && String(Number(value)) === value
const stored = readLocalStorage(key) ?? ''
const uid = ref(validUid(stored) ? stored : '')
const draft = ref(uid.value)
const profile = shallowRef<GameAlbumProfile>()
const editing = ref(!uid.value)
const busy = ref(false)
const error = ref<'invalid' | 'query' | 'storage' | null>(null)
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
let request = 0
onBeforeUnmount(() => {
  request++
})

function edit() {
  request++
  busy.value = false
  error.value = null
  draft.value = uid.value
  editing.value = true
}
function cancel() {
  request++
  busy.value = false
  error.value = null
  editing.value = false
}
async function query(save: boolean) {
  if (busy.value) return
  const value = save ? draft.value.trim() : uid.value
  if (!validUid(value)) {
    error.value = 'invalid'
    return
  }
  const id = ++request
  busy.value = true
  error.value = null
  try {
    const result = await props.loadProfile(value)
    if (id !== request) return
    if (!result) {
      error.value = 'query'
      return
    }
    if (save) {
      try {
        localStorage.setItem(key, value)
      } catch {
        error.value = 'storage'
        return
      }
    }
    uid.value = value
    profile.value = result
    editing.value = false
  } catch {
    if (id === request) error.value = 'query'
  } finally {
    if (id === request) busy.value = false
  }
}
if (uid.value) void query(false)
</script>

<template>
  <section class="mobile-profile" :aria-label="t('我的角色', 'My character')">
    <GameAlbumProfileCard
      v-if="uid"
      :uid="uid"
      :profile="profile"
      :language="language"
      editable-uid
      @edit-uid="edit"
      @open-avatar-simulator="emit('editAvatarFrame', uid)"
    >
      <template v-if="editing" #uid>
        <ProfileUidForm
          v-model="draft"
          :busy="busy"
          :invalid="error === 'invalid'"
          :language="language"
          @submit="query(true)"
          @cancel="cancel"
        />
      </template>
    </GameAlbumProfileCard>
    <ProfileUidForm
      v-else
      v-model="draft"
      initial
      :busy="busy"
      :invalid="error === 'invalid'"
      :language="language"
      @submit="query(true)"
    />
    <p v-if="busy && !editing" role="status">{{ t('正在获取角色资料…', 'Loading character…') }}</p>
    <p v-if="error" role="alert">{{
      error === 'invalid'
        ? t('请输入有效的数字 UID。', 'Enter a valid numeric UID.')
        : error === 'storage'
          ? t(
              '无法保存 UID，请检查浏览器存储设置后重试。',
              'Unable to save UID. Check browser storage settings and retry.'
            )
          : t(
              '暂未获取到角色，请检查 UID 或重试。',
              'Unable to load character. Check the UID or retry.'
            )
    }}</p>
    <button
      v-if="error === 'query' && !editing"
      type="button"
      :disabled="busy"
      @click="query(false)"
      >{{ t('重试', 'Retry') }}</button
    >
  </section>
</template>

<style scoped>
.mobile-profile {
  margin-bottom: 12px;
}
.mobile-profile p {
  padding: 0 10px;
  font-size: 13px;
  color: var(--text);
}
</style>
