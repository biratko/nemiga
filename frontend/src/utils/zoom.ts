export function getUiZoom(): number {
    return parseFloat(document.documentElement.style.zoom) || 1
}
