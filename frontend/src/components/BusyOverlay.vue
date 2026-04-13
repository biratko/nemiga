<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useBusyState } from '@/composables/useBusyState'

const props = defineProps<{
  panelId: string
  overlayDelayMs: number
  timeoutMs: number
}>()

const { isBusy, cancelBusy } = useBusyState()
const busy = isBusy(props.panelId)

const showOverlay = ref(false)
const showDialog = ref(false)

let overlayTimer: ReturnType<typeof setTimeout> | null = null
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (overlayTimer !== null) { clearTimeout(overlayTimer); overlayTimer = null }
  if (timeoutTimer !== null) { clearTimeout(timeoutTimer); timeoutTimer = null }
}

watch(busy, (val) => {
  if (val) {
    overlayTimer = setTimeout(() => {
      showOverlay.value = true
      timeoutTimer = setTimeout(() => {
        showDialog.value = true
      }, props.timeoutMs)
    }, props.overlayDelayMs)
  } else {
    clearTimers()
    showOverlay.value = false
    showDialog.value = false
  }
})

function onCancel() {
  cancelBusy(props.panelId)
}

function onWait() {
  showDialog.value = false
  if (timeoutTimer !== null) clearTimeout(timeoutTimer)
  timeoutTimer = setTimeout(() => {
    showDialog.value = true
  }, props.timeoutMs)
}

onBeforeUnmount(() => clearTimers())
</script>

<template>
  <div v-if="showOverlay" class="busy-overlay" @click.stop @mousedown.stop>
    <div class="spinner"></div>
    <div v-if="showDialog" class="timeout-dialog">
      <p class="timeout-text">Operation is taking longer than expected</p>
      <div class="timeout-buttons">
        <button class="btn-wait" @click="onWait">Wait</button>
        <button class="btn-cancel" @click="onCancel">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.busy-overlay {
  position: absolute;
  inset: 0;
  background: var(--busy-overlay-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: all;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid transparent;
  border-top-color: var(--busy-overlay-spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.timeout-dialog {
  margin-top: 16px;
  padding: 12px 20px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  text-align: center;
}

.timeout-text {
  margin: 0 0 12px 0;
  font-size: var(--font-size);
  color: var(--busy-overlay-text-color);
}

.timeout-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.timeout-buttons button {
  padding: 4px 16px;
  background: var(--bg-header);
  color: var(--text-primary);
  border: 1px solid var(--border);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-sm);
}

.timeout-buttons button:hover {
  background: var(--bg-row-hover);
}

.btn-cancel {
  color: var(--accent) !important;
  border-color: var(--accent) !important;
}
</style>
