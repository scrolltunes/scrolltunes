"use client"

import { springs } from "@/animations"
import { X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef } from "react"

export interface ModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title?: string
  readonly children: React.ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement | null
      modalRef.current?.focus()
    } else {
      previousActiveElement.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={handleBackdropClick}
        >
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={springs.default}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
            tabIndex={-1}
            className="relative w-full max-w-md rounded-t-lg p-6 shadow-xl focus:outline-none sm:mx-4 sm:rounded-lg"
            style={{
              background: "var(--color-surface1)",
              borderColor: "var(--color-border)",
              borderWidth: 1,
              borderStyle: "solid",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
              style={{ color: "var(--color-text3)" }}
              aria-label="Close"
            >
              <X size={20} weight="bold" />
            </button>

            {title && (
              <h2
                id="modal-title"
                className="mb-6 pr-8 text-xl font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {title}
              </h2>
            )}

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
