<script setup lang="ts">
import { computed } from 'vue'
import { Check, CircleCheck } from 'lucide-vue-next'
import { useCompactLayout } from '../composables/useCompactLayout'
import CatalogImage from './CatalogImage.vue'
import type { Language } from '../i18n/types'
import type { WardrobeCatalog, WardrobeEntry } from '../utils/wardrobe/wardrobeCatalog'
import type { WardrobeSnapshot } from '../utils/wardrobe/wardrobeStorage'
import { wardrobeFamilyKey } from '../utils/wardrobe/wardrobeFamilies'
import {
  wardrobeEvolutionMessages,
  wardrobeVariantLabels
} from '../utils/wardrobe/wardrobePresentation'
import { getOwnershipSummary, hasWardrobeSnapshot } from '../utils/wardrobe/wardrobeOwnership'
const compact = useCompactLayout()
const props = defineProps<{
  entry: WardrobeEntry
  catalog?: WardrobeCatalog | null
  snapshot?: WardrobeSnapshot
  language: Language
  horizontal?: boolean
  ownershipIcons?: boolean
}>()
const isOwned = (entry: WardrobeEntry) =>
  !!props.snapshot &&
  hasWardrobeSnapshot(props.snapshot) &&
  getOwnershipSummary(entry, props.snapshot).complete
defineEmits<{ select: [entry: WardrobeEntry] }>()
const forms = computed(() =>
  (props.catalog?.entries ?? [])
    .filter((entry) => wardrobeFamilyKey(entry) === wardrobeFamilyKey(props.entry))
    .sort((a, b) => a.variant - b.variant)
)
const selectedIndex = computed(() => forms.value.findIndex((form) => form.id === props.entry.id))
function status(entry: WardrobeEntry) {
  const zh = props.language === 'zh'
  if (!props.snapshot || !hasWardrobeSnapshot(props.snapshot)) return zh ? '未知' : 'Unknown'
  const summary = getOwnershipSummary(entry, props.snapshot)
  return summary.complete
    ? zh
      ? '已拥有'
      : 'Owned'
    : summary.owned
      ? zh
        ? '收集中'
        : 'Partial'
      : summary.unknown
        ? zh
          ? '未知'
          : 'Unknown'
        : zh
          ? '未拥有'
          : 'Not owned'
}
</script>
<template>
  <nav
    v-if="forms.length > 1"
    class="wardrobe-form-nav"
    :class="{ 'is-pieces': entry.kind === 'item', 'is-horizontal': compact || horizontal }"
    :style="{ '--form-count': forms.length }"
    :aria-label="wardrobeEvolutionMessages[language].forms"
  >
    <div
      v-for="(form, index) in forms"
      :key="form.id"
      class="form-stage"
      :class="{ 'is-past': index < selectedIndex, 'is-current': entry.id === form.id }"
    >
      <button
        type="button"
        :aria-pressed="entry.id === form.id"
        :aria-current="entry.id === form.id ? 'step' : undefined"
        :aria-label="wardrobeVariantLabels[language][form.variant] + ' · ' + status(form)"
        @click="$emit('select', form)"
      >
        <span class="wardrobe-form-image">
          <CatalogImage :src="form.image" :language="language" alt="" />
          <Check
            v-if="compact && entry.id === form.id"
            class="wardrobe-form-selected"
            :size="20"
            aria-hidden="true"
          />
        </span>
        <span class="form-label">
          <span class="wardrobe-form-title">
            <strong>{{ wardrobeVariantLabels[language][form.variant] }}</strong>
            <CircleCheck
              v-if="ownershipIcons && isOwned(form)"
              class="wardrobe-form-owned"
              :size="14"
              aria-hidden="true"
            />
          </span>
          <small v-if="!ownershipIcons">{{ status(form) }}</small>
        </span>
      </button>
    </div>
  </nav>
</template>
<style scoped>
.wardrobe-form-image {
  display: contents;
}
.wardrobe-form-nav {
  --form-selected-shadow: 0 1px 5px color-mix(in srgb, var(--primary-button-bg) 20.2%, transparent);
  position: relative;
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  margin: 0;
  overflow: visible;
  display: grid;
  grid-template-rows: repeat(var(--form-count), minmax(0, 1fr));
  gap: 8px;
  padding: 12px 20px 24px 36px;
  background: var(--surface-soft);
}
@supports not (color: color-mix(in srgb, black, white)) {
  .wardrobe-form-nav {
    --form-selected-shadow: 0 1px 5px rgb(201 132 134 / 20%);
  }
}

:where(:root[data-theme='dark']) .wardrobe-form-nav {
  --form-selected-shadow: 0 2px 8px color-mix(in srgb, var(--primary-button-bg) 52.4%, transparent);
}
@supports not (color: color-mix(in srgb, black, white)) {
  :where(:root[data-theme='dark']) .wardrobe-form-nav {
    --form-selected-shadow: 0 2px 8px rgb(239 176 178 / 52%);
  }
}

button {
  box-sizing: border-box;
  position: relative;
  display: block;
  width: min(100cqw, calc(100cqh * 448 / 656));
  aspect-ratio: 448 / 656;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--archive-background-image, url('../../img/云绸.webp')) center / cover no-repeat;
  background-color: var(--surface);
  box-shadow: var(--photo-shadow);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}
:where(:root[data-theme='dark']) button {
  background-image: var(--archive-background-image, url('../../img/longBgdark.jpg'));
}
.form-stage {
  position: relative;
  min-height: 0;
  container-type: size;
  display: grid;
  place-items: center;
}
.is-pieces button {
  width: min(100cqw, 100cqh);
  aspect-ratio: 1;
}
/* Each segment follows its card height, keeping the axis aligned on resize. */
.form-stage::before {
  content: '';
  position: absolute;
  left: -17px;
  top: -4px;
  bottom: -4px;
  width: 2px;
  background: var(--line);
}
.form-stage:first-child::before {
  top: 50%;
}
.form-stage:last-child::before {
  bottom: 50%;
}
.form-stage.is-past::before {
  background: var(--primary-button-bg);
}
.form-stage.is-current::before {
  background: linear-gradient(
    to bottom,
    var(--primary-button-bg) 42%,
    var(--primary-button-bg) 58%,
    var(--line) 88%
  );
}
.form-stage.is-current:last-child::before {
  background: var(--primary-button-bg);
}
.form-stage::after {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid var(--muted);
  border-radius: 50%;
  background: var(--surface);
  transform: translate(-50%, -50%);
}
.form-stage.is-current::after {
  width: 14px;
  height: 14px;
  border-width: 3px;
  border-color: var(--primary-button-bg);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--primary-button-bg) 12%, transparent),
    0 0 9px 2px color-mix(in srgb, var(--primary-button-bg) 28%, transparent);
}
@supports not (color: color-mix(in srgb, black, white)) {
  .form-stage.is-current::after {
    box-shadow:
      0 0 0 4px var(--line),
      0 0 9px 2px var(--primary-button-bg);
  }
}
button[aria-pressed='true'],
button:hover,
button:focus-visible {
  border-color: var(--primary-button-bg);
  box-shadow: var(--form-selected-shadow);
}
button:focus-visible {
  outline: 2px solid var(--primary-button-bg);
  outline-offset: 2px;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  border-radius: inherit;
}
.form-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 16px 2px 4px;
  border-radius: 0 0 11px 11px;
  text-align: center;
  white-space: nowrap;
  background: linear-gradient(
    to bottom,
    transparent 0,
    color-mix(in srgb, var(--surface) 78%, transparent) 16px,
    var(--surface) 100%
  );
}
@supports not (color: color-mix(in srgb, black, white)) {
  .form-label {
    background: linear-gradient(to bottom, transparent, var(--surface) 100%);
  }
}
strong {
  flex-shrink: 0;
  font-size: 13px;
}
small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: inherit;
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
