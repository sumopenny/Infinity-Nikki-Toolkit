<script setup lang="ts">
import { computed } from 'vue'
import Dialog from './UpdateLogDialog.vue'
import { updateLogZh, updateLogEn } from '../i18n/messages/updateLog'
const props = defineProps<{
  language: 'zh' | 'en'
  visible: boolean
  dismissed: boolean | 'forever'
}>()
const messages = computed(() => (props.language === 'zh' ? updateLogZh : updateLogEn))
</script>
<template><Dialog :visible="visible" :dismissed="dismissed" :messages="messages" /></template>
