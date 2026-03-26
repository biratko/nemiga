import {ref} from 'vue'

interface ToastItem {
    id: number
    message: string
}

const toasts = ref<ToastItem[]>([])
let nextId = 0
let durationMs = 3000

export function showToast(message: string): void {
    const id = nextId++
    toasts.value.push({id, message})
    setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id)
    }, durationMs)
}

export function setToastDuration(ms: number): void {
    durationMs = ms
}

export function useToast() {
    return {toasts, showToast, setToastDuration}
}
