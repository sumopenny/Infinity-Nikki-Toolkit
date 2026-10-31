<script setup lang="ts">
import DesktopMenuTransition from './DesktopMenuTransition.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import type { LocaleMessages } from '../i18n'
import { useBodyScrollLock } from '../utils/bodyScrollLock'

const props = defineProps<{
  visible: boolean
  accounts: string[]
  rememberedChoice: string | null
  messages: LocaleMessages['cleanup']
}>()

const emit = defineEmits<{
  confirm: [accountIds: string[], remember: boolean, choice: string]
  cancel: []
}>()

const selectedAccount = ref('')
const cleanAllAccounts = ref(false)
const rememberChoice = ref(false)
const menuOpen = ref(false)
const selectRef = ref<HTMLButtonElement | null>(null)
const dropdownWrapRef = ref<HTMLDivElement | null>(null)
const selectId = 'cleanup-account-select'
useBodyScrollLock(toRef(props, 'visible'))

// 已选择有效账号，或勾选全部账号时可以继续
const canConfirm = computed(() => {
  if (cleanAllAccounts.value) return true
  return props.accounts.includes(selectedAccount.value)
})

/** 处理弹窗键盘操作。参数：键盘事件；按 Escape 时取消。 */
function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  emit('cancel')
}

/** 切换账号下拉菜单开合。参数：无；勾选全部账号时下拉禁用不响应。 */
function toggleMenu() {
  if (cleanAllAccounts.value) return
  menuOpen.value = !menuOpen.value
}

/** 选中账号并收起菜单。参数：account 为账号 id。 */
function selectAccount(account: string) {
  selectedAccount.value = account
  menuOpen.value = false
  selectRef.value?.focus()
}

/** 下拉打开时优先用 Esc 收起菜单而不是关闭整个弹窗。参数：键盘事件。 */
function handleDropdownKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !menuOpen.value) return
  event.stopPropagation()
  menuOpen.value = false
}

/** 点击下拉区域外时收起菜单。参数：鼠标事件。 */
function handleDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return
  if (!dropdownWrapRef.value?.contains(event.target as Node)) menuOpen.value = false
}

onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))

/** 确认账号选择。参数：无；勾选全部时返回全部账号，否则返回选中的账号 id；同时带出是否记住选择及具体选项。 */
function confirmSelection() {
  if (cleanAllAccounts.value) {
    emit('confirm', [...props.accounts], rememberChoice.value, 'all')
    return
  }
  if (!props.accounts.includes(selectedAccount.value)) return
  emit('confirm', [selectedAccount.value], rememberChoice.value, selectedAccount.value)
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      // 有记住的选择时回填：'all' 对应清理全部账号，其余为具体账号 id
      const remembered = props.rememberedChoice
      selectedAccount.value =
        remembered && remembered !== 'all' && props.accounts.includes(remembered) ? remembered : ''
      cleanAllAccounts.value = remembered === 'all'
      rememberChoice.value = remembered === 'all' || selectedAccount.value !== ''
      menuOpen.value = false
      nextTick(() => selectRef.value?.focus())
    }
  }
)

// 勾选全部账号时下拉禁用，同时收起已打开的菜单
watch(cleanAllAccounts, (checked) => {
  if (checked) menuOpen.value = false
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="visible"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="messages.accountDialogTitle"
        @click.self="emit('cancel')"
        @keydown="handleDialogKeydown"
      >
        <section class="confirm-dialog-panel is-warning cleanup-account-panel">
          <div class="confirm-dialog-content">
            <h2>{{ messages.accountDialogTitle }}</h2>
            <p>{{ messages.accountDialogMessage }}</p>
          </div>

          <div class="cleanup-account-form">
            <label class="cleanup-account-input-label" :for="selectId">{{
              messages.accountInputLabel
            }}</label>
            <div
              ref="dropdownWrapRef"
              class="cleanup-account-select-wrap"
              @keydown="handleDropdownKeydown"
            >
              <button
                :id="selectId"
                ref="selectRef"
                type="button"
                class="cleanup-account-select"
                :class="{ 'is-placeholder': !selectedAccount, open: menuOpen }"
                :disabled="cleanAllAccounts"
                aria-haspopup="listbox"
                :aria-expanded="menuOpen"
                @click="toggleMenu()"
              >
                <span>{{ selectedAccount || messages.accountSelectPlaceholder }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </button>
              <DesktopMenuTransition>
                <div
                  v-if="menuOpen"
                  class="cleanup-account-menu"
                  role="listbox"
                  :aria-label="messages.accountInputLabel"
                >
                  <button
                    v-for="account in accounts"
                    :key="account"
                    type="button"
                    role="option"
                    :aria-selected="selectedAccount === account"
                    :class="{ active: selectedAccount === account }"
                    @click="selectAccount(account)"
                  >
                    <span>{{ account }}</span>
                  </button>
                </div>
              </DesktopMenuTransition>
            </div>
            <div class="cleanup-account-options">
              <label class="cleanup-account-all app-checkbox-label">
                <input
                  v-model="cleanAllAccounts"
                  class="app-checkbox"
                  style="--checkbox-size: 13px"
                  type="checkbox"
                />
                <span>{{ messages.allAccounts }}</span>
              </label>
              <label class="cleanup-account-all app-checkbox-label">
                <input
                  v-model="rememberChoice"
                  class="app-checkbox"
                  style="--checkbox-size: 13px"
                  type="checkbox"
                />
                <span>{{ messages.rememberChoice }}</span>
              </label>
            </div>
          </div>

          <div class="confirm-dialog-actions">
            <button class="confirm-dialog-button ghost" type="button" @click="emit('cancel')">
              {{ messages.accountCancel }}
            </button>
            <button
              class="confirm-dialog-button primary"
              type="button"
              :disabled="!canConfirm"
              @click="confirmSelection"
            >
              {{ messages.accountConfirm }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
