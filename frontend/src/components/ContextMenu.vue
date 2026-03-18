<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { FSEntry } from '@/types/fs'

const props = defineProps<{
  x: number
  y: number
  entry: FSEntry | null
  hasMultiSelect: boolean
}>()

const emit = defineEmits<{
  select: [action: string, event: MouseEvent]
  close: []
}>()

const menuEl = ref<HTMLElement | null>(null)

const showUnpack = computed(() =>
  props.entry?.isArchive === true && !props.hasMultiSelect
)

function onClickOutside(e: MouseEvent) {
  if (menuEl.value?.contains(e.target as Node)) return
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside, { capture: true })
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside, { capture: true })
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="menuEl"
    class="context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <div class="context-menu-item" @click="emit('select', 'rename', $event)">
      Rename
    </div>
    <div v-if="showUnpack" class="context-menu-item" @click="emit('select', 'extract', $event)">
      Unpack
    </div>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.2);
  min-width: 120px;
  padding: 2px 0;
}

.context-menu-item {
  padding: 4px 16px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.context-menu-item:hover {
  background: var(--bg-selected);
  color: var(--text-selected);
}
</style>
