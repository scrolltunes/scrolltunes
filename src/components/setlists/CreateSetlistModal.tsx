"use client"

import { springs } from "@/animations"
import { INPUT_LIMITS } from "@/constants/limits"
import { type Setlist, setlistsStore } from "@/core"
import { X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useState } from "react"

export interface CreateSetlistModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onCreate?: (setlist: Setlist) => void
}

const PRESET_COLORS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Sky", value: "#0ea5e9" },
]

export function CreateSetlistModal({ isOpen, onClose, onCreate }: CreateSetlistModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

      const options: { description?: string; color?: string } = {
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(selectedColor ? { color: selectedColor } : {}),
      }

      const setlist = await setlistsStore.create(name.trim(), options)

      setIsSubmitting(false)

      if (setlist) {
        onCreate?.(setlist)
        setName("")
        setDescription("")
        setSelectedColor(undefined)
        onClose()
      }
    },
    [name, description, selectedColor, isSubmitting, onCreate, onClose],
  )

  const handleClose = useCallback(() => {
    setName("")
    setDescription("")
    setSelectedColor(undefined)
    onClose()
  }, [onClose])

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
            className="relative mx-4 w-full max-w-sm rounded-sm p-6 shadow-xl"
            style={{ background: "var(--color-bg)" }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-sm p-1.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
              style={{ color: "var(--color-text3)" }}
              aria-label="Close"
            >
              <X size={20} weight="bold" />
            </button>

            <h2
              className="font-mono text-xl font-semibold mb-6 pr-8"
              style={{ color: "var(--color-text)" }}
            >
              Create setlist
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
                  className="w-full px-3 py-2 rounded-sm focus:outline-none focus:ring-2"
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
                  className="w-full px-3 py-2 rounded-sm focus:outline-none focus:ring-2 resize-none"
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
                  className="flex-1 px-4 py-2.5 rounded-sm transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                  style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-sm transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  {isSubmitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
