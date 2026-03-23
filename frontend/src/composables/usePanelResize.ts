import {ref, nextTick, onMounted, onUnmounted} from 'vue'
import {getUiZoom} from '@/utils/zoom'

const STORAGE_KEY = 'panel-split-percent'
const MIN_PERCENT = 15
const MAX_PERCENT = 85
const DEFAULT_PERCENT = 50

export function usePanelResize() {
    const splitPercent = ref(DEFAULT_PERCENT)
    const isDragging = ref(false)
    const showInput = ref(false)
    const inputValue = ref('')
    const tooltipX = ref(0)
    const tooltipY = ref(0)

    let containerEl: HTMLElement | null = null
    let inputRef: HTMLInputElement | null = null

    function load() {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
            const n = parseFloat(saved)
            if (!isNaN(n) && n >= MIN_PERCENT && n <= MAX_PERCENT) {
                splitPercent.value = n
            }
        }
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, String(Math.round(splitPercent.value * 10) / 10))
    }

    function clamp(v: number): number {
        return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, v))
    }

    function calcPercent(clientX: number): number {
        if (!containerEl) return DEFAULT_PERCENT
        const zoom = getUiZoom()
        const rect = containerEl.getBoundingClientRect()
        const x = clientX / zoom
        const left = rect.left / zoom
        const width = rect.width / zoom
        return clamp(((x - left) / width) * 100)
    }

    function onMouseDown(e: MouseEvent) {
        if (e.button !== 0) return
        if (showInput.value) return
        e.preventDefault()
        isDragging.value = true
        const zoom = getUiZoom()
        tooltipX.value = e.clientX / zoom
        tooltipY.value = e.clientY / zoom
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging.value) return
        splitPercent.value = calcPercent(e.clientX)
        const zoom = getUiZoom()
        tooltipX.value = e.clientX / zoom
        tooltipY.value = e.clientY / zoom
    }

    function onMouseUp() {
        if (!isDragging.value) return
        isDragging.value = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        save()
    }

    function onDblClick() {
        isDragging.value = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        showInput.value = true
        inputValue.value = splitPercent.value.toFixed(1)
        nextTick(() => {
            setTimeout(() => { inputRef?.focus(); inputRef?.select() }, 0)
        })
    }

    function applyInput() {
        const n = parseFloat(inputValue.value)
        if (!isNaN(n)) {
            splitPercent.value = clamp(n)
            save()
        }
        showInput.value = false
    }

    function cancelInput() {
        showInput.value = false
    }

    function setContainer(el: HTMLElement) {
        containerEl = el
    }

    function setInputRef(el: HTMLInputElement | null) {
        inputRef = el
    }

    onMounted(() => {
        load()
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    })

    onUnmounted(() => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
    })

    return {
        splitPercent,
        isDragging,
        showInput,
        inputValue,
        tooltipX,
        tooltipY,
        onMouseDown,
        onDblClick,
        applyInput,
        cancelInput,
        setContainer,
        setInputRef,
    }
}
