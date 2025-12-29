"use client"

import { springs } from "@/animations"
import { buildGradientPalette, extractDominantColor, type GradientOption } from "@/lib/colors"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CopySimple,
  DownloadSimple,
  MusicNote,
  Palette,
  ShareNetwork,
  X,
} from "@phosphor-icons/react"
import * as htmlToImage from "html-to-image"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface LyricLine {
  readonly id: string
  readonly text: string
}

export interface LyricsShareModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly artist: string
  readonly albumArt?: string | null
  readonly lines: readonly LyricLine[]
}

type Step = "select" | "preview"

const CUSTOM_COLOR_ID = "custom"

export function LyricsShareModal({
  isOpen,
  onClose,
  title,
  artist,
  albumArt,
  lines,
}: LyricsShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("select")
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [gradientPalette, setGradientPalette] = useState<readonly GradientOption[]>([])
  const [selectedGradientId, setSelectedGradientId] = useState<string>("")
  const [customColor, setCustomColor] = useState("#4f46e5")
  const [showBranding, setShowBranding] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [shareSupported, setShareSupported] = useState(false)
  const [copied, setCopied] = useState(false)

  // Get the current background style
  const currentBackground = useMemo(() => {
    if (selectedGradientId === CUSTOM_COLOR_ID) {
      return customColor
    }
    const gradient = gradientPalette.find(g => g.id === selectedGradientId)
    return gradient?.gradient ?? gradientPalette[0]?.gradient ?? "#4f46e5"
  }, [selectedGradientId, gradientPalette, customColor])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep("select")
      setSelectedIndices(new Set())
      setShowBranding(false)
    }
  }, [isOpen])

  useEffect(() => {
    setShareSupported(
      typeof navigator !== "undefined" && "share" in navigator && "canShare" in navigator,
    )
  }, [])

  useEffect(() => {
    if (!isOpen) return

    if (!albumArt) {
      const palette = buildGradientPalette(null)
      setGradientPalette(palette)
      const first = palette[0]
      if (first) {
        setSelectedGradientId(first.id)
      }
      return
    }

    extractDominantColor(albumArt).then(dominantColor => {
      const palette = buildGradientPalette(dominantColor)
      setGradientPalette(palette)
      const first = palette[0]
      if (first) {
        setSelectedGradientId(first.id)
      }
    })
  }, [isOpen, albumArt])

  const selectedLines = useMemo(() => {
    return Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map(i => lines[i])
      .filter((line): line is LyricLine => line !== undefined)
  }, [selectedIndices, lines])

  const toggleLine = useCallback((index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const handleNext = useCallback(() => {
    if (selectedIndices.size > 0) {
      setStep("preview")
    }
  }, [selectedIndices.size])

  const handleBack = useCallback(() => {
    setStep("select")
  }, [])

  const handleCustomColorClick = useCallback(() => {
    setSelectedGradientId(CUSTOM_COLOR_ID)
    colorInputRef.current?.click()
  }, [])

  const generateImage = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null
    setIsGenerating(true)

    try {
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        cacheBust: true,
      })

      const response = await fetch(dataUrl)
      return await response.blob()
    } catch (error) {
      console.error("Failed to generate image:", error)
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${title} - ${artist} lyrics.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [generateImage, title, artist])

  const handleCopy = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }, [generateImage])

  const handleShare = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return

    const file = new File([blob], `${title} - ${artist} lyrics.png`, { type: "image/png" })

    if (shareSupported && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${title} by ${artist}`,
        })
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Share failed:", error)
        }
      }
    } else {
      await handleDownload()
    }
  }, [generateImage, title, artist, shareSupported, handleDownload])

  // Filter out empty lines for selection
  const selectableLines = useMemo(() => {
    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.text.trim() !== "" && line.text.trim() !== "♪")
  }, [lines])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springs.default}
            className="relative mx-0 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-neutral-900 shadow-xl sm:mx-4 sm:max-w-lg sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center gap-3">
                {step === "preview" && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    aria-label="Back"
                  >
                    <ArrowLeft size={20} weight="bold" />
                  </button>
                )}
                <h2 className="text-lg font-semibold text-white">
                  {step === "select" ? "Select lyrics" : "Share lyrics"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 border-b border-neutral-800 px-4 py-2">
              <div
                className={`h-1.5 w-12 rounded-full transition-colors ${
                  step === "select" ? "bg-indigo-500" : "bg-neutral-700"
                }`}
              />
              <div
                className={`h-1.5 w-12 rounded-full transition-colors ${
                  step === "preview" ? "bg-indigo-500" : "bg-neutral-700"
                }`}
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {step === "select" ? (
                  <motion.div
                    key="select"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="p-4"
                  >
                    <p className="mb-3 text-sm text-neutral-400">
                      Tap the lyrics you want to share
                    </p>
                    <div className="space-y-1">
                      {selectableLines.map(({ line, index }) => {
                        const isSelected = selectedIndices.has(index)
                        return (
                          <button
                            key={line.id}
                            type="button"
                            onClick={() => toggleLine(index)}
                            className={`relative w-full rounded-lg px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? "bg-indigo-600/20 text-white"
                                : "text-neutral-300 hover:bg-neutral-800"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                  isSelected
                                    ? "border-indigo-500 bg-indigo-500"
                                    : "border-neutral-600"
                                }`}
                              >
                                {isSelected && (
                                  <Check size={12} weight="bold" className="text-white" />
                                )}
                              </div>
                              <span className="text-sm leading-relaxed">{line.text}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="p-4"
                  >
                    {/* Card preview */}
                    <div
                      ref={cardRef}
                      className="mx-auto max-w-sm rounded-3xl p-6 shadow-2xl"
                      style={{ background: currentBackground }}
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black/20">
                          {albumArt ? (
                            <img
                              src={albumArt}
                              alt=""
                              className="h-full w-full object-cover"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <MusicNote size={24} weight="fill" className="text-white/60" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white break-words">{title}</p>
                          <p className="text-sm text-white/70 break-words">{artist}</p>
                        </div>
                      </div>

                      <div
                        className="space-y-1"
                        style={{ marginBottom: showBranding ? "1rem" : 0 }}
                      >
                        {selectedLines.map(line => (
                          <p
                            key={line.id}
                            className="text-lg font-semibold leading-relaxed text-white"
                          >
                            {line.text}
                          </p>
                        ))}
                      </div>

                      {showBranding && <p className="text-xs text-white/50">scrolltunes.com</p>}
                    </div>

                    {/* Options */}
                    <div className="mt-4 space-y-4">
                      {/* Background color */}
                      <div>
                        <p className="mb-2 text-sm text-neutral-400">Background</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {gradientPalette.map(option => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setSelectedGradientId(option.id)}
                              className="relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                              style={{
                                background: option.gradient,
                                borderColor:
                                  selectedGradientId === option.id ? "white" : "transparent",
                              }}
                              aria-label={`Select gradient ${option.id}`}
                            >
                              {selectedGradientId === option.id && (
                                <Check
                                  size={16}
                                  weight="bold"
                                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-md"
                                />
                              )}
                            </button>
                          ))}

                          {/* Custom color button */}
                          <button
                            type="button"
                            onClick={handleCustomColorClick}
                            className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                            style={{
                              backgroundColor:
                                selectedGradientId === CUSTOM_COLOR_ID
                                  ? customColor
                                  : "transparent",
                              borderColor:
                                selectedGradientId === CUSTOM_COLOR_ID ? "white" : "#525252",
                            }}
                            aria-label="Choose custom color"
                          >
                            {selectedGradientId === CUSTOM_COLOR_ID ? (
                              <Check
                                size={16}
                                weight="bold"
                                className="text-white drop-shadow-md"
                              />
                            ) : (
                              <Palette size={16} className="text-neutral-400" />
                            )}
                          </button>

                          {/* Hidden color input */}
                          <input
                            ref={colorInputRef}
                            type="color"
                            value={customColor}
                            onChange={e => {
                              setCustomColor(e.target.value)
                              setSelectedGradientId(CUSTOM_COLOR_ID)
                            }}
                            className="sr-only"
                            aria-label="Custom color picker"
                          />
                        </div>
                      </div>

                      {/* Branding toggle */}
                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={showBranding}
                            onChange={e => setShowBranding(e.target.checked)}
                            className="sr-only"
                          />
                          <div
                            className={`h-6 w-11 rounded-full transition-colors ${
                              showBranding ? "bg-indigo-600" : "bg-neutral-700"
                            }`}
                          />
                          <div
                            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                              showBranding ? "translate-x-5" : ""
                            }`}
                          />
                        </div>
                        <span className="text-sm text-neutral-300">Show scrolltunes.com</span>
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer actions */}
            <div className="flex gap-3 border-t border-neutral-800 p-4">
              {step === "select" ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={selectedIndices.size === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ArrowRight size={20} weight="bold" />
                </button>
              ) : (
                <div className="flex w-full flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={isGenerating}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 ${
                        copied
                          ? "bg-emerald-600 text-white"
                          : "bg-neutral-800 text-white hover:bg-neutral-700"
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check size={20} weight="bold" />
                          Copied
                        </>
                      ) : (
                        <>
                          <CopySimple size={20} weight="bold" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={isGenerating}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-800 px-4 py-3 font-medium text-white transition-colors hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                    >
                      <DownloadSimple size={20} weight="bold" />
                      {isGenerating ? "..." : "Save"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleShare}
                    disabled={isGenerating}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                  >
                    <ShareNetwork size={20} weight="bold" />
                    Share
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
