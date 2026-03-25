import { ref, type Ref } from 'vue'
import type { FSEntry } from '@/types/fs'
import type { PanelAPI } from '@/types/panel'
import { joinPath } from '@/utils/path'

export interface CopyOp {
  sources: string[]
  destination: string
}

export interface MoveOp {
  sources: string[]
  destination: string
}

export interface DeleteOp {
  names: string[]
  paths: string[]
  basePath: string
}

export interface MkdirOp {
  basePath: string
}

function buildPaths(selected: FSEntry[], basePath: string): string[] {
  return selected.map(e => joinPath(basePath, e.name))
}

export function useFileOperations(
  activePanel: Ref<'left' | 'right'>,
  leftPanel: Ref<PanelAPI | undefined>,
  rightPanel: Ref<PanelAPI | undefined>,
) {
  const copyOp = ref<CopyOp | null>(null)
  const moveOp = ref<MoveOp | null>(null)
  const deleteOp = ref<DeleteOp | null>(null)
  const mkdirOp = ref<MkdirOp | null>(null)

  function getSourcePanel(): PanelAPI | undefined {
    return activePanel.value === 'left' ? leftPanel.value : rightPanel.value
  }

  function getTargetPanel(): PanelAPI | undefined {
    return activePanel.value === 'left' ? rightPanel.value : leftPanel.value
  }

  function getOperationEntries(source: PanelAPI): FSEntry[] {
    if (source.selectedEntries.length > 0) return source.selectedEntries
    if (source.cursorEntry) return [source.cursorEntry]
    return []
  }

  function startCopy() {
    const source = getSourcePanel()
    const target = getTargetPanel()
    if (!source || !target) return

    const entries = getOperationEntries(source)
    if (!entries.length) return

    const basePath: string = source.currentPath
    const sources = buildPaths(entries, basePath)
    const destination: string = target.currentPath

    copyOp.value = { sources, destination }
  }

  function startMove() {
    const source = getSourcePanel()
    const target = getTargetPanel()
    if (!source || !target) return

    const entries = getOperationEntries(source)
    if (!entries.length) return

    const basePath: string = source.currentPath
    const sources = buildPaths(entries, basePath)
    const destination: string = target.currentPath

    moveOp.value = { sources, destination }
  }

  function startDelete() {
    const source = getSourcePanel()
    if (!source) return

    const entries = getOperationEntries(source)
    if (!entries.length) return

    const basePath: string = source.currentPath
    const paths = buildPaths(entries, basePath)
    const names = entries.map((e: FSEntry) => e.name)

    deleteOp.value = { names, paths, basePath }
  }

  function startMkdir() {
    const source = getSourcePanel()
    if (!source) return
    mkdirOp.value = { basePath: source.currentPath }
  }

  return { copyOp, moveOp, deleteOp, mkdirOp, startCopy, startMove, startDelete, startMkdir }
}
