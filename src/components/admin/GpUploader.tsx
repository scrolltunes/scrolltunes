"use client"

import {
  type LyricSyllable,
  type WordTiming,
  buildWordTimings,
  extractLyrics,
  parseGuitarProFile,
} from "@/lib/gp"
import { Check, FileArrowUp, Warning } from "@phosphor-icons/react"
import { useCallback, useRef, useState } from "react"

const ACCEPTED_EXTENSIONS = [".gp", ".gp3", ".gp4", ".gp5", ".gpx"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

interface GpUploaderProps {
  onExtracted: (data: {
    meta: { title: string; artist: string; album?: string | undefined }
    wordTimings: WordTiming[]
    syllables: LyricSyllable[]
  }) => void
  disabled?: boolean | undefined
}

type UploadState = "idle" | "loading" | "success" | "error"

export function GpUploader({ onExtracted, disabled = false }: GpUploaderProps) {
  const [state, setState] = useState<UploadState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setError(`Invalid file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`)
        setState("error")
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 10MB")
        setState("error")
        return
      }

      setState("loading")
      setError(null)

      try {
        const score = await parseGuitarProFile(file)
        const extracted = extractLyrics(score)

        if (extracted.syllables.length === 0) {
          setError("No lyrics found in this file. GP3 files often lack embedded lyrics")
          setState("error")
          return
        }

        const wordTimings = buildWordTimings(extracted.syllables, extracted.tempo)

        setState("success")
        onExtracted({
          meta: extracted.meta,
          wordTimings,
          syllables: extracted.syllables,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to parse file"
        setError(message)
        setState("error")
      }
    },
    [onExtracted],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (disabled) return

      const file = e.dataTransfer.files[0]
      if (file) {
        processFile(file)
      }
    },
    [disabled, processFile],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) {
        setIsDragOver(true)
      }
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        processFile(file)
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [processFile],
  )

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative flex flex-col items-center justify-center gap-3 p-8
        border-2 border-dashed rounded-xl transition-colors cursor-pointer
        ${isDragOver ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-700 bg-neutral-900"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-neutral-600 hover:bg-neutral-800/50"}
        ${state === "error" ? "border-red-500/50" : ""}
        ${state === "success" ? "border-emerald-500/50" : ""}
      `}
      aria-label="Upload Guitar Pro file"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {state === "loading" ? (
        <>
          <div className="w-10 h-10 border-2 border-neutral-600 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-sm text-neutral-400">Parsing file...</p>
        </>
      ) : state === "error" ? (
        <>
          <Warning size={40} weight="fill" className="text-red-400" />
          <p className="text-sm text-red-400 text-center">{error}</p>
          <p className="text-xs text-neutral-500">Click to try again</p>
        </>
      ) : state === "success" ? (
        <>
          <Check size={40} weight="bold" className="text-emerald-400" />
          <p className="text-sm text-emerald-400">Lyrics extracted</p>
          <p className="text-xs text-neutral-500">Click to upload another file</p>
        </>
      ) : (
        <>
          <FileArrowUp size={40} weight="duotone" className="text-neutral-500" />
          <p className="text-sm text-neutral-400">Drop a Guitar Pro file here</p>
          <p className="text-xs text-neutral-500">.gp, .gp3, .gp4, .gp5, .gpx (max 10MB)</p>
        </>
      )}
    </div>
  )
}
