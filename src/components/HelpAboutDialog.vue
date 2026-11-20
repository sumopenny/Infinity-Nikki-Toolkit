<script setup lang="ts">
import { computed, ref, toRef, useId, watch } from 'vue'
import {
  Archive,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Download,
  Hand,
  Images,
  Keyboard,
  MousePointer2,
  ScanSearch,
  Shirt,
  SlidersHorizontal,
  X
} from 'lucide-vue-next'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { useModalFocus } from '../composables/useModalFocus'
import {
  helpTaskOrder,
  type HelpAboutMessages,
  type HelpLayoutText,
  type HelpTaskId
} from '../i18n/messages/helpAbout'

const props = defineProps<{
  visible: boolean
  compact: boolean
  messages: HelpAboutMessages
}>()
const emit = defineEmits<{ close: [] }>()

const dialogId = useId()
const panelRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const expandedTask = ref<HelpTaskId | null>(null)
const operationIcons = { mouse: MousePointer2, keyboard: Keyboard, touch: Hand }
const taskIcons = {
  album: Images,
  save: Shirt,
  camera: ScanSearch,
  archive: BookOpen,
  backup: Archive,
  tools: SlidersHorizontal,
  install: Download
}

const layout = computed(() => (props.compact ? 'mobile' : 'desktop'))
const operations = computed(() => props.messages.operations[layout.value])
const tasks = computed(() =>
  helpTaskOrder
    .filter((id) => id !== 'album' || !props.compact)
    .map((id) => {
      const task = props.messages.tasks[id]
      return {
        ...task,
        id,
        entry: textForLayout(task.entry),
        steps: task.steps.map(textForLayout)
      }
    })
)

function textForLayout(text: HelpLayoutText) {
  return typeof text === 'string' ? text : text[layout.value]
}

const visible = toRef(props, 'visible')
useBodyScrollLock(visible)
useModalFocus(visible, panelRef, closeDialog, undefined, closeButtonRef)

watch(
  [visible, layout],
  ([open, currentLayout], [, previousLayout]) => {
    if (!open) return
    expandedTask.value = null
    if (bodyRef.value) bodyRef.value.scrollTop = 0
    // 布局切换可能移除当前聚焦的任务，让焦点回到仍可用的关闭按钮。
    if (currentLayout !== previousLayout) closeButtonRef.value?.focus({ preventScroll: true })
  },
  { flush: 'post' }
)

function toggleTask(id: HelpTaskId) {
  expandedTask.value = expandedTask.value === id ? null : id
}

function closeDialog() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog" appear>
      <div
        v-if="visible"
        class="dialog-overlay help-about-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${dialogId}-title`"
        @click.self="closeDialog"
      >
        <section
          ref="panelRef"
          class="dialog-panel help-about-panel"
          :class="{ 'is-compact': compact }"
        >
          <header class="help-about-header">
            <h2 :id="`${dialogId}-title`">
              <span class="help-about-mark"><CircleHelp :size="20" aria-hidden="true" /></span>
              {{ messages.title }}
            </h2>
            <button
              ref="closeButtonRef"
              type="button"
              :title="messages.closeAria"
              :aria-label="messages.closeAria"
              @click="closeDialog"
            >
              <X :size="19" aria-hidden="true" />
            </button>
          </header>
          <div ref="bodyRef" class="help-about-body">
            <div class="help-about-operations">
              <section v-for="group in operations" :key="group.kind" :class="`is-${group.kind}`">
                <h3>
                  <component :is="operationIcons[group.kind]" :size="17" aria-hidden="true" />
                  {{ group.title }}
                </h3>
                <dl>
                  <div v-for="row in group.rows" :key="row.result" class="help-about-operation">
                    <dt v-if="typeof row.input === 'string'">{{ row.input }}</dt>
                    <dt v-else class="help-about-keys">
                      <template v-for="(key, index) in row.input" :key="key">
                        <span v-if="index && row.joiner">{{ row.joiner }}</span>
                        <kbd>{{ key }}</kbd>
                      </template>
                    </dt>
                    <dd>{{ row.result }}</dd>
                  </div>
                </dl>
              </section>
            </div>
            <section class="help-about-tasks" :aria-labelledby="`${dialogId}-tasks`">
              <h3 :id="`${dialogId}-tasks`">{{ messages.tasksTitle }}</h3>
              <div class="help-about-task-list">
                <div v-for="task in tasks" :key="task.id" class="help-about-task">
                  <h4>
                    <button
                      type="button"
                      class="accordion-toggle"
                      :aria-expanded="expandedTask === task.id"
                      :aria-controls="`${dialogId}-${task.id}`"
                      @click="toggleTask(task.id)"
                    >
                      <span class="help-about-mark">
                        <component :is="taskIcons[task.id]" :size="16" aria-hidden="true" />
                      </span>
                      <span class="help-about-task-label">{{ task.title }}</span>
                      <ChevronDown :size="17" aria-hidden="true" />
                    </button>
                  </h4>
                  <div
                    :id="`${dialogId}-${task.id}`"
                    class="accordion-answer"
                    :class="{ expanded: expandedTask === task.id }"
                    :inert="expandedTask === task.id ? undefined : true"
                  >
                    <div>
                      <div class="help-about-task-content">
                        <p class="help-about-task-entry">{{ task.entry }}</p>
                        <ul>
                          <li v-for="step in task.steps" :key="step">{{ step }}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
