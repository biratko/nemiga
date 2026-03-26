<script setup lang="ts">
import {useToast} from '@/composables/useToast'

const {toasts} = useToast()
</script>

<template>
    <div class="toast-container">
        <TransitionGroup name="toast">
            <div v-for="t in toasts" :key="t.id" class="toast-item">
                {{ t.message }}
            </div>
        </TransitionGroup>
    </div>
</template>

<style scoped>
.toast-container {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column-reverse;
    gap: 4px;
    pointer-events: none;
}

.toast-item {
    background: rgba(0, 0, 0, 0.82);
    color: #fff;
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    white-space: nowrap;
    pointer-events: auto;
}

.toast-enter-active {
    transition: opacity 0.2s, transform 0.2s;
}

.toast-leave-active {
    transition: opacity 0.15s;
}

.toast-enter-from {
    opacity: 0;
    transform: translateY(8px);
}

.toast-leave-to {
    opacity: 0;
}
</style>
