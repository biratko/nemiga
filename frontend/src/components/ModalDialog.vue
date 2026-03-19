<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'

defineProps<{title: string; wide?: boolean}>()

const dialogRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !dialogRef.value) return

    const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) {
        e.preventDefault()
        return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey) {
        if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
        }
    } else {
        if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
        }
    }
}

onMounted(() => {
    previouslyFocused = document.activeElement as HTMLElement | null

    if (dialogRef.value) {
        const first = dialogRef.value.querySelector<HTMLElement>(FOCUSABLE)
        if (first) first.focus()
        else dialogRef.value.focus()
    }

    document.addEventListener('keydown', trapFocus)
})

onUnmounted(() => {
    document.removeEventListener('keydown', trapFocus)
    previouslyFocused?.focus()
})
</script>

<template>
    <div class="backdrop">
        <div class="dialog" :class="{wide}" ref="dialogRef" tabindex="-1" role="dialog" aria-modal="true">
            <div class="dialog-title">{{ title }}</div>
            <div class="dialog-body">
                <slot />
            </div>
        </div>
    </div>
</template>

<style scoped>
.backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
}

.dialog {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    min-width: 420px;
    max-width: 600px;
    width: 90%;
}

.dialog.wide {
    width: 80%;
    height: 80%;
    min-width: auto;
    max-width: none;
    display: flex;
    flex-direction: column;
}

.dialog.wide .dialog-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    gap: 0;
}

.dialog-title {
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    padding: 6px 12px;
    font-weight: bold;
    color: var(--accent);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dialog-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
</style>
