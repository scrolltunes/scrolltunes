"use client"

import { springs } from "@/animations"
import { ArrowSquareOut, MicrophoneSlash } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo } from "react"

export interface PermissionPromptProps {
  /** Called when user wants to retry */
  readonly onRetry?: () => void
  /** Called when user dismisses the prompt */
  readonly onDismiss?: () => void
}

/**
 * Prompt shown when microphone permission is denied
 *
 * Provides instructions for enabling mic access and retry option.
 */
export const PermissionPrompt = memo(function PermissionPrompt({
  onRetry,
  onDismiss,
}: PermissionPromptProps) {
  return (
    <motion.div
      className="fixed inset-x-4 bottom-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:max-w-md
        bg-neutral-900 border border-neutral-700 rounded-xl p-4 shadow-xl z-50"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={springs.default}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
          <MicrophoneSlash size={24} className="text-red-400" weight="fill" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-white mb-1">Microphone access needed</h3>
          <p className="text-sm text-neutral-400 mb-3">
            ScrollTunes needs microphone access to detect your voice and sync lyrics automatically.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try again
            </button>

            <a
              href="https://support.google.com/chrome/answer/2693767"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1"
            >
              How to enable
              <ArrowSquareOut size={16} />
            </a>

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 text-neutral-400 hover:text-white text-sm transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})
