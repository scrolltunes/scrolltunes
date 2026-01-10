"use client"

import { songEditsStore, useIsEditMode, useSongEditsState } from "@/core"
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react"

interface SelectionState {
  /** Set of selected line IDs */
  readonly selectedIds: ReadonlySet<string>
  /** Last selected line ID for anchor reference */
  readonly anchorId: string | null
}

interface EditModeContextValue {
  // Selection state
  readonly selectedIds: ReadonlySet<string>
  readonly selectedCount: number

  // Selection actions
  readonly toggleLine: (lineId: string) => void
  readonly selectAll: (allLineIds: readonly string[]) => void
  readonly clearSelection: () => void
  readonly isSelected: (lineId: string) => boolean

  // Line operations (delegates to store)
  readonly skipSelected: (allLineIds: readonly string[]) => void
  readonly unskipSelected: (allLineIds: readonly string[]) => void

  // Edit mode state from store
  readonly isEditMode: boolean
  readonly isDirty: boolean
  readonly isSaving: boolean
  readonly hasEdits: boolean

  // Edit mode actions
  readonly enterEditMode: () => void
  readonly exitEditMode: () => void
  readonly saveEdits: () => Promise<boolean>
  readonly revertEdits: () => void
}

const EditModeContext = createContext<EditModeContextValue | null>(null)

interface EditModeProviderProps {
  readonly children: ReactNode
}

export function EditModeProvider({ children }: EditModeProviderProps) {
  const [selection, setSelection] = useState<SelectionState>({
    selectedIds: new Set(),
    anchorId: null,
  })

  const editsState = useSongEditsState()
  const isEditMode = useIsEditMode()

  // Selection helpers
  const toggleLine = useCallback((lineId: string) => {
    setSelection(prev => {
      const newIds = new Set(prev.selectedIds)
      if (newIds.has(lineId)) {
        newIds.delete(lineId)
      } else {
        newIds.add(lineId)
      }
      return { selectedIds: newIds, anchorId: lineId }
    })
  }, [])

  const selectAll = useCallback((allLineIds: readonly string[]) => {
    setSelection({
      selectedIds: new Set(allLineIds),
      anchorId: allLineIds[0] ?? null,
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelection({ selectedIds: new Set(), anchorId: null })
  }, [])

  const isSelected = useCallback(
    (lineId: string) => selection.selectedIds.has(lineId),
    [selection.selectedIds],
  )

  // Line operations
  const skipSelected = useCallback(
    (allLineIds: readonly string[]) => {
      for (const lineId of selection.selectedIds) {
        const lineIndex = allLineIds.indexOf(lineId)
        if (lineIndex !== -1) {
          songEditsStore.skipLine(lineIndex)
        }
      }
    },
    [selection.selectedIds],
  )

  const unskipSelected = useCallback(
    (allLineIds: readonly string[]) => {
      for (const lineId of selection.selectedIds) {
        const lineIndex = allLineIds.indexOf(lineId)
        if (lineIndex !== -1) {
          songEditsStore.unskipLine(lineIndex)
        }
      }
    },
    [selection.selectedIds],
  )

  // Edit mode actions
  const enterEditMode = useCallback(() => {
    songEditsStore.enterEditMode()
  }, [])

  const exitEditMode = useCallback(() => {
    clearSelection()
    songEditsStore.exitEditMode()
  }, [clearSelection])

  const saveEdits = useCallback(async () => {
    const success = await songEditsStore.saveEdits()
    return success
  }, [])

  const revertEdits = useCallback(() => {
    clearSelection()
    songEditsStore.revertToOriginal()
  }, [clearSelection])

  const value = useMemo<EditModeContextValue>(
    () => ({
      // Selection state
      selectedIds: selection.selectedIds,
      selectedCount: selection.selectedIds.size,

      // Selection actions
      toggleLine,
      selectAll,
      clearSelection,
      isSelected,

      // Line operations
      skipSelected,
      unskipSelected,

      // Edit mode state
      isEditMode,
      isDirty: editsState.isDirty,
      isSaving: editsState.status === "saving",
      hasEdits: songEditsStore.hasEdits(),

      // Edit mode actions
      enterEditMode,
      exitEditMode,
      saveEdits,
      revertEdits,
    }),
    [
      selection,
      toggleLine,
      selectAll,
      clearSelection,
      isSelected,
      skipSelected,
      unskipSelected,
      isEditMode,
      editsState.isDirty,
      editsState.status,
      enterEditMode,
      exitEditMode,
      saveEdits,
      revertEdits,
    ],
  )

  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
}

export function useEditMode(): EditModeContextValue {
  const context = useContext(EditModeContext)
  if (!context) {
    throw new Error("useEditMode must be used within EditModeProvider")
  }
  return context
}

/**
 * Hook to use edit mode only if provider is present
 * Returns null if not inside EditModeProvider (safe for optional usage)
 */
export function useEditModeOptional(): EditModeContextValue | null {
  return useContext(EditModeContext)
}
