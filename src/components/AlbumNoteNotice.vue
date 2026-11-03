<script setup lang="ts">
import { computed } from 'vue'
import type { AlbumNoteSnapshot } from '../utils/file-system/photoMetadata'
const props = defineProps<{
  snapshot: AlbumNoteSnapshot
  compatible: boolean
  language: string
  busy: boolean
}>()
defineEmits<{ recover: [name: string | null] }>()
const zh = computed(() => props.language === 'zh')
const candidates = computed(() =>
  props.snapshot.candidates.filter((file) => file.state === 'valid')
)
const summary = computed(() => {
  const main = props.snapshot.main
  if (main.state === 'valid')
    return zh.value
      ? '照片已打开。检测到上次保存留下的待提交文件。'
      : 'Photos opened. A pending file remains from a previous save.'
  if (main.state === 'partial')
    return zh.value
      ? `照片已打开。有 ${main.badEntries} 条备注无效，其余备注已显示。`
      : `Photos opened. ${main.badEntries} invalid note entries were skipped.`
  if (main.state === 'unsupported')
    return zh.value
      ? '照片已打开。当前版本无法读取这个版本的相册备注。'
      : 'Photos opened. This version of the album notes is unsupported.'
  return zh.value
    ? '照片已打开，但相册备注未能读取。'
    : 'Photos opened, but album notes could not be loaded.'
})
</script>

<template>
  <aside class="album-note-warning" role="status">
    <strong>{{ summary }}</strong>
    <span>{{
      zh ? '处理备注文件前，备注和回收站写入已暂停。' : 'Note edits and trash changes are paused.'
    }}</span>
    <span v-if="snapshot.previewName"
      >{{ zh ? '当前展示副本中的备注：' : 'Previewing notes from '
      }}{{ snapshot.previewName }}</span
    >
    <div v-for="file in candidates" :key="file.name">
      {{ zh ? '发现可恢复的备注' : 'Recoverable notes' }} · {{ file.name }} ·
      {{ Object.keys(file.metadata.photos).length }} {{ zh ? '条' : 'entries' }} ·
      {{ new Date(file.modified).toLocaleString(zh ? 'zh-CN' : 'en') }}
      <button
        v-if="!compatible && snapshot.main.state !== 'unreadable'"
        type="button"
        :disabled="busy"
        @click="$emit('recover', file.name)"
        >{{ zh ? '从此副本恢复' : 'Restore this copy' }}</button
      >
    </div>
    <button
      v-if="!compatible && snapshot.main.state === 'valid'"
      type="button"
      :disabled="busy"
      @click="$emit('recover', null)"
      >{{ zh ? '保留当前版本' : 'Keep current version' }}</button
    >
    <small v-if="compatible && candidates.length">{{
      zh
        ? '只读模式：先将原文件和副本备份到其他目录，再复制所选副本到相册，命名为 album-metadata.json，重新打开相册。'
        : 'Read-only: back up the original and candidates elsewhere, copy the chosen version back as album-metadata.json, then reopen.'
    }}</small>
    <small v-else-if="!candidates.length && snapshot.main.state !== 'valid'">{{
      zh
        ? '请备份原备注文件，修复后重新打开相册。'
        : 'Back up the original notes file, repair it and reopen the album.'
    }}</small>
  </aside>
</template>

<style scoped>
.album-note-warning {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem 1rem;
  margin-bottom: 0.75rem;
  border: 1px solid currentColor;
  border-radius: 0.6rem;
  overflow-wrap: anywhere;
}
.album-note-warning button {
  justify-self: start;
  text-decoration: underline;
}
</style>
