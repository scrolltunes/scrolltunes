"use client"

import { springs } from "@/animations"
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
            className="relative mx-4 w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl"
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Close"
            >
              <X size={20} weight="bold" />
            </button>

            <h2 className="text-xl font-semibold text-white mb-6 pr-8">Edit setlist</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="setlist-name"
                  className="block text-sm font-medium text-neutral-400 mb-1.5"
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
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label
                  htmlFor="setlist-description"
                  className="block text-sm font-medium text-neutral-400 mb-1.5"
                >
                  Description (optional)
                </label>
                <textarea
                  id="setlist-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add a description"
                  rows={2}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <fieldset>
                <legend className="block text-sm font-medium text-neutral-400 mb-2">
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
                          ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-900"
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
                  className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>

              <button
                type="button"
                onClick={handleDelete}
                className="w-full px-4 py-2.5 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 hover:text-red-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
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
