<script setup lang="ts">
import { UserRound } from 'lucide-vue-next'
import type { Language } from '../i18n'

defineProps<{ initial?: boolean; busy: boolean; invalid: boolean; language: Language }>()
const draft = defineModel<string>({ required: true })
const emit = defineEmits<{ submit: []; cancel: [] }>()
</script>

<template>
  <form
    class="profile-uid-form"
    :class="{ 'is-initial': initial }"
    @submit.prevent="emit('submit')"
  >
    <header v-if="initial" class="profile-uid-intro">
      <UserRound :size="26" aria-hidden="true" />
      <div>
        <strong>{{ language === 'zh' ? '我的角色' : 'My character' }}</strong>
        <p>{{
          language === 'zh'
            ? '输入游戏 UID，查看角色信息'
            : 'Enter your game UID to view your character'
        }}</p>
      </div>
    </header>
    <label v-else for="manual-profile-uid">UID</label>
    <input
      id="manual-profile-uid"
      v-model="draft"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :aria-label="language === 'zh' ? '游戏 UID' : 'Game UID'"
      :aria-invalid="invalid"
      :disabled="busy"
      :placeholder="language === 'zh' ? '输入游戏 UID' : 'Enter game UID'"
    />
    <button class="profile-uid-submit" type="submit" :disabled="busy">
      {{
        busy
          ? language === 'zh'
            ? '查询中…'
            : 'Loading…'
          : initial
            ? language === 'zh'
              ? '查看角色'
              : 'View character'
            : language === 'zh'
              ? '保存'
              : 'Save'
      }}
    </button>
    <button v-if="!initial" class="profile-uid-cancel" type="button" @click="emit('cancel')">{{
      language === 'zh' ? '取消' : 'Cancel'
    }}</button>
  </form>
</template>

<style scoped>
.profile-uid-form {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.profile-uid-form label {
  color: var(--text);
  font-size: 12px;
}
.profile-uid-form input {
  flex: 1;
  min-width: 0;
  width: 0;
  height: 28px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition:
    border-color var(--motion-base) ease,
    box-shadow var(--motion-base) ease,
    background var(--motion-base) ease;
}
.profile-uid-form input:is(:focus, :focus-visible) {
  outline: none;
  border-color: var(--pink-deep);
  background: var(--search-focus-bg, var(--surface-strong));
  box-shadow: var(--input-focus-shadow);
}
.profile-uid-form button {
  flex-shrink: 0;
  width: auto;
  min-height: 28px;
  justify-content: center;
  padding: 4px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.5;
}
.profile-uid-form .profile-uid-submit {
  border: 1px solid var(--accent-border-subtle);
  background: var(--primary-button-bg);
  color: var(--primary-text);
}
.profile-uid-form .profile-uid-cancel {
  background: transparent;
  color: var(--text);
}
.profile-uid-form button:focus-visible {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.profile-uid-form.is-initial {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--accent-border-subtle);
  border-radius: 20px;
  background: var(--surface-accent-subtle);
}
.is-initial input {
  width: 100%;
  height: 36px;
  font-size: 16px;
}
.is-initial .profile-uid-submit {
  width: auto;
  min-height: 36px;
  padding-inline: 12px;
  white-space: nowrap;
  font-weight: 600;
}
.profile-uid-intro {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--menu-hover-text);
}
.profile-uid-intro strong {
  color: var(--heading);
  font-size: 14px;
}
.profile-uid-intro p {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
}
</style>
