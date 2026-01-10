"use client"

import { springs } from "@/animations"
import { INPUT_LIMITS } from "@/constants/limits"
import { setlistsStore } from "@/core"
import { X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

export interface EditSetlistModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly setlist: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly color?: string
  }
  readonly onSave?: () => void
  readonly onDelete?: () => void
}

const PRESET_COLORS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Sky", value: "#0ea5e9" },
]

export function EditSetlistModal({
  isOpen,
  onClose,
  setlist,
  onSave,
  onDelete,
}: EditSetlistModalProps) {
  const [name, setName] = useState(setlist.name)
  const [description, setDescription] = useState(setlist.description ?? "")
  const [selectedColor, setSelectedColor] = useState<string | undefined>(setlist.color)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(setlist.name)
      setDescription(setlist.description ?? "")
      setSelectedColor(setlist.color)
    }
  }, [isOpen, setlist])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!name.trim() || isSubmitting) return

      setIsSubmitting(true)

      const trimmedName = name.trim()
      const trimmedDescription = description.trim()

      const updates: { name?: string; description?: string; color?: string | null } = {}

      if (trimmedName !== setlist.name) {
        updates.name = trimmedName
      }

      if (trimmedDescription !== (setlist.description ?? "")) {
        updates.description = trimmedDescription
      }

      if (selectedColor !== setlist.color) {
        updates.color = selectedColor ?? null
      }

      const success = await setlistsStore.update(setlist.id, updates)

      setIsSubmitting(false)

      if (success) {
        onSave?.()
        onClose()
      }
    },
    [name, description, selectedColor, isSubmitting, setlist, onSave, onClose],
  )

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleDelete = useCallback(() => {
    onDelete?.()
  }, [onDelete])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springs.default}
            className="relative mx-4 w-full max-w-sm rounded-2xl p-6 shadow-xl"
            style={{ background: "var(--color-surface1)" }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
              style={{ color: "var(--color-text3)" }}
              aria-label="Close"
            >
              <X size={20} weight="bold" />
            </button>

            <h2 className="text-xl font-semibold mb-6 pr-8" style={{ color: "var(--color-text)" }}>
              Edit setlist
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="setlist-name"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--color-text3)" }}
                >
                  Name
                </label>
                <input
                  id="setlist-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="My setlist"
                  required
                  maxLength={INPUT_LIMITS.SETLIST_NAME}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                  style={{
                    background: "var(--color-surface2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="setlist-description"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--color-text3)" }}
                >
                  Description (optional)
                </label>
                <textarea
                  id="setlist-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add a description"
                  rows={2}
                  maxLength={INPUT_LIMITS.SETLIST_DESCRIPTION}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 resize-none"
                  style={{
                    background: "var(--color-surface2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                />
              </div>

              <fieldset>
                <legend
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--color-text3)" }}
                >
                  Color (optional)
                </legend>
                <div className="flex gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() =>
                        setSelectedColor(selectedColor === color.value ? undefined : color.value)
                      }
                      className={`w-8 h-8 rounded-full transition-all ${
                        selectedColor === color.value
                          ? "ring-2 ring-white ring-offset-2"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: color.value }}
                      aria-label={color.name}
                      aria-pressed={selectedColor === color.value}
                    />
                  ))}
                </div>
              </fieldset>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 rounded-lg transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                  style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-lg transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>

              <button
                type="button"
                onClick={handleDelete}
                className="w-full px-4 py-2.5 rounded-lg transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                style={{
                  background: "var(--color-danger-soft)",
                  color: "var(--color-danger)",
                }}
              >
                Delete setlist
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
