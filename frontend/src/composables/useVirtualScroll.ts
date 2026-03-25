import { ref, computed, onMounted, onUnmounted, watch, type Ref, type ComputedRef } from 'vue'

export function useVirtualScroll(
  containerRef: Ref<HTMLElement | null>,
  totalCount: Ref<number> | ComputedRef<number>,
  rowHeight: number,
  overscan = 5,
) {
  const scrollTop = ref(0)
  const containerHeight = ref(0)

  const startIndex = computed(() => {
    const raw = Math.floor(scrollTop.value / rowHeight) - overscan
    return Math.max(0, raw)
  })

  const endIndex = computed(() => {
    const raw = Math.floor(scrollTop.value / rowHeight) + Math.ceil(containerHeight.value / rowHeight) + overscan
    return Math.min(totalCount.value, raw)
  })

  const topSpacerHeight = computed(() => startIndex.value * rowHeight)
  const bottomSpacerHeight = computed(() => (totalCount.value - endIndex.value) * rowHeight)

  function onScroll() {
    const el = containerRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
    containerHeight.value = el.clientHeight
  }

  function scrollToIndex(index: number) {
    const el = containerRef.value
    if (!el) return
    const thead = el.querySelector('thead')
    const stickyHeight = thead ? thead.offsetHeight : 0
    const rowTop = stickyHeight + index * rowHeight
    const rowBottom = rowTop + rowHeight
    const viewTop = el.scrollTop + stickyHeight
    const viewBottom = el.scrollTop + el.clientHeight

    if (rowTop < viewTop) {
      el.scrollTop = rowTop - stickyHeight
    } else if (rowBottom > viewBottom) {
      el.scrollTop = rowBottom - el.clientHeight
    }
  }

  let resizeObserver: ResizeObserver | null = null

  function attach(el: HTMLElement) {
    el.addEventListener('scroll', onScroll, { passive: true })
    containerHeight.value = el.clientHeight
    scrollTop.value = el.scrollTop

    resizeObserver = new ResizeObserver(() => {
      containerHeight.value = el.clientHeight
    })
    resizeObserver.observe(el)
  }

  function detach(el: HTMLElement) {
    el.removeEventListener('scroll', onScroll)
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  onMounted(() => {
    if (containerRef.value) attach(containerRef.value)
  })

  onUnmounted(() => {
    if (containerRef.value) detach(containerRef.value)
  })

  watch(containerRef, (newEl, oldEl) => {
    if (oldEl) detach(oldEl)
    if (newEl) attach(newEl)
  })

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    scrollToIndex,
  }
}
