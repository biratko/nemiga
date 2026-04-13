import { reactive, computed } from 'vue'

interface PanelBusyEntry {
  busy: boolean
  abortController: AbortController | null
}

const state = reactive(new Map<string, PanelBusyEntry>())

function getOrCreate(panelId: string): PanelBusyEntry {
  if (!state.has(panelId)) {
    state.set(panelId, { busy: false, abortController: null })
  }
  return state.get(panelId)!
}

export function useBusyState() {
  function startBusy(panelId: string): AbortController {
    const entry = getOrCreate(panelId)
    if (entry.abortController) {
      entry.abortController.abort()
    }
    const ctrl = new AbortController()
    entry.abortController = ctrl
    entry.busy = true
    return ctrl
  }

  function endBusy(panelId: string): void {
    const entry = state.get(panelId)
    if (!entry) return
    entry.busy = false
    entry.abortController = null
  }

  function cancelBusy(panelId: string): void {
    const entry = state.get(panelId)
    if (!entry) return
    if (entry.abortController) {
      entry.abortController.abort()
    }
    endBusy(panelId)
  }

  function isBusy(panelId: string) {
    return computed(() => getOrCreate(panelId).busy)
  }

  function isAnyBusy() {
    return computed(() => {
      for (const entry of state.values()) {
        if (entry.busy) return true
      }
      return false
    })
  }

  return { startBusy, endBusy, cancelBusy, isBusy, isAnyBusy }
}
