"use client"

import { springs } from "@/animations"
import { buildGradientPalette, extractDominantColor, type GradientOption } from "@/lib/colors"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowsIn,
  ArrowsOut,
  Check,
  CopySimple,
  DownloadSimple,
  Heart,
  MusicNote,
  Palette,
  PencilSimple,
  Question,
  ShareNetwork,
  X,
} from "@phosphor-icons/react"
import * as htmlToImage from "html-to-image"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

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
  readonly spotifyId?: string | null
  readonly lines: readonly LyricLine[]
}

type Step = "select" | "preview"

const CUSTOM_COLOR_ID = "custom"

type LayoutVariant = "default" | "large-art" | "minimal" | "centered" | "quote"

interface LayoutOption {
  readonly id: LayoutVariant
  readonly label: string
}

// Hidden for now, may re-enable later
const _LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { id: "default", label: "Default" },
  { id: "large-art", label: "Large Art" },
  { id: "minimal", label: "Minimal" },
  { id: "centered", label: "Centered" },
  { id: "quote", label: "Quote" },
] as const
void _LAYOUT_OPTIONS

type PatternVariant = "none" | "dots" | "grid" | "waves" | "random"

interface PatternOption {
  readonly id: PatternVariant
  readonly label: string
}

const PATTERN_OPTIONS: readonly PatternOption[] = [
  { id: "none", label: "None" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "waves", label: "Waves" },
  { id: "random", label: "Random" },
] as const

function generateSmokeWaves(seed: number): string {
  const seededRandom = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000
    return x - Math.floor(x)
  }

  const paths: string[] = []
  const numWaves = 5 + Math.floor(seededRandom(0) * 4)

  for (let i = 0; i < numWaves; i++) {
    const startY = seededRandom(i * 10) * 100
    const amplitude = 10 + seededRandom(i * 20) * 25
    const frequency = 0.5 + seededRandom(i * 30) * 1.5
    const phaseShift = seededRandom(i * 40) * Math.PI * 2
    const opacity = 0.03 + seededRandom(i * 50) * 0.05

    let d = `M 0 ${startY}`
    for (let x = 0; x <= 100; x += 2) {
      const y = startY + Math.sin((x * frequency * Math.PI) / 50 + phaseShift) * amplitude
      d += ` L ${x} ${y}`
    }

    paths.push(
      `<path d="${d}" fill="none" stroke="rgba(255,255,255,${opacity})" stroke-width="${0.5 + seededRandom(i * 60) * 1}"/>`
    )
  }

  return paths.join("")
}

function getPatternStyle(pattern: PatternVariant): React.CSSProperties {
  switch (pattern) {
    case "dots":
      return {
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }
    case "grid":
      return {
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }
    case "waves":
      return {
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.03) 8px, rgba(255,255,255,0.03) 16px)",
      }
    default:
      return {}
  }
}

const cardBaseStyles: React.CSSProperties = {
  fontFamily: "Arial, Helvetica, sans-serif",
  fontKerning: "none",
  letterSpacing: "0px",
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
  textRendering: "geometricPrecision",
}

const textStyles: React.CSSProperties = {
  fontKerning: "none",
  letterSpacing: "0px",
  wordSpacing: "0px",
}

export function LyricsShareModal({
  isOpen,
  onClose,
  title,
  artist,
  albumArt,
  spotifyId,
  lines,
}: LyricsShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [cardElement, setCardElement] = useState<HTMLDivElement | null>(null)

  // Callback ref to detect when card is mounted
  const cardCallbackRef = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node
    setCardElement(node)
  }, [])
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("select")
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [gradientPalette, setGradientPalette] = useState<readonly GradientOption[]>([])
  const [selectedGradientId, setSelectedGradientId] = useState<string>("")
  const [customColor, setCustomColor] = useState("#4f46e5")
  const [showBranding, setShowBranding] = useState(false)
  const [showSpotifyCode, setShowSpotifyCode] = useState(false)
  const [showShadow, setShowShadow] = useState(true)
  const [expandedWidth, setExpandedWidth] = useState(true)
  const [layout, setLayout] = useState<LayoutVariant>("default")
  const [pattern, setPattern] = useState<PatternVariant>("none")
  const [patternSeed, setPatternSeed] = useState(() => Date.now())
  const [isGenerating, setIsGenerating] = useState(false)
  const [shareSupported, setShareSupported] = useState(false)
  const [copied, setCopied] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedLines, setEditedLines] = useState<Map<string, string>>(new Map())

  const currentBackground = useMemo(() => {
    if (selectedGradientId === CUSTOM_COLOR_ID) {
      return customColor
    }
    const gradient = gradientPalette.find(g => g.id === selectedGradientId)
    return gradient?.gradient ?? gradientPalette[0]?.gradient ?? "#4f46e5"
  }, [selectedGradientId, gradientPalette, customColor])

  const spotifyCodeUrl = useMemo(() => {
    if (!spotifyId) return null
    return `https://scannables.scdn.co/uri/plain/png/000000/white/280/spotify:track:${spotifyId}`
  }, [spotifyId])

  const smokeSvgDataUrl = useMemo(() => {
    const paths = generateSmokeWaves(patternSeed)
    const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }, [patternSeed])

  useEffect(() => {
    if (isOpen) {
      setStep("select")
      setSelectedIndices(new Set())
      setShowBranding(false)
      setShowSpotifyCode(false)
      setShowShadow(true)
      setExpandedWidth(true)
      setLayout("default")
      setPattern("none")
      setIsEditing(false)
      setEditedLines(new Map())
    }
  }, [isOpen])

  useEffect(() => {
    if (step === "preview") {
      scrollContainerRef.current?.scrollTo({ top: 0 })
    }
  }, [step])

  // Calculate scale to fit card within preview container with small margins
  const calculateScale = useCallback(() => {
    const container = previewContainerRef.current
    const card = cardRef.current
    if (!container || !card) return

    // 4% margin on each side = 92% of container width available
    const availableWidth = container.clientWidth * 0.92
    const cardWidth = card.scrollWidth
    const cardHeight = card.scrollHeight

    if (cardWidth > availableWidth) {
      const scale = Math.max(0.5, availableWidth / cardWidth)
      // Round to 3 decimal places to avoid sub-pixel jitter
      const roundedScale = Math.round(scale * 1000) / 1000
      setPreviewScale(roundedScale)
      setScaledHeight(Math.round(cardHeight * roundedScale))
    } else {
      setPreviewScale(1)
      setScaledHeight(null)
    }
  }, [expandedWidth])

  // Use layout effect to calculate scale before paint
  useLayoutEffect(() => {
    if (step !== "preview" || !cardElement) {
      setPreviewScale(1)
      setScaledHeight(null)
      return
    }
    calculateScale()
  }, [step, calculateScale, selectedIndices.size, cardElement])

  // Use ResizeObserver to recalculate when card size changes
  useEffect(() => {
    if (step !== "preview") return

    const card = cardRef.current
    if (!card) return

    const observer = new ResizeObserver(() => {
      calculateScale()
    })
    observer.observe(card)

    window.addEventListener("resize", calculateScale)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", calculateScale)
    }
  }, [step, calculateScale])

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

  // Get display text for a line (edited or original)
  const getLineText = useCallback(
    (line: LyricLine) => editedLines.get(line.id) ?? line.text,
    [editedLines],
  )

  // Update edited text for a line
  const updateLineText = useCallback((lineId: string, text: string) => {
    setEditedLines(prev => {
      const next = new Map(prev)
      next.set(lineId, text)
      return next
    })
  }, [])

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
        pixelRatio: 3,
        cacheBust: true,
        style: {
          fontKerning: "none",
          letterSpacing: "0px",
        },
        fontEmbedCSS: "",
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

  const selectableLines = useMemo(() => {
    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.text.trim() !== "" && line.text.trim() !== "♪")
  }, [lines])

  const renderCardContent = () => {
    const patternStyles =
      pattern === "random"
        ? { backgroundImage: smokeSvgDataUrl, backgroundSize: "100% 100%" }
        : getPatternStyle(pattern)
    const hasPattern = pattern !== "none"

    switch (layout) {
      case "large-art":
        return (
          <div
            ref={cardRef}
            style={{
              ...cardBaseStyles,
              background: currentBackground,
              borderRadius: "24px",
              overflow: "hidden",
              maxWidth: "384px",
              margin: "0 auto",
              position: "relative",
            }}
          >
            {hasPattern && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  ...patternStyles,
                  pointerEvents: "none",
                }}
              />
            )}
            {albumArt && (
              <div style={{ width: "100%", aspectRatio: "1", position: "relative" }}>
                <img
                  src={albumArt}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.7) 100%)",
                  }}
                />
              </div>
            )}
            <div style={{ padding: "24px", position: "relative" }}>
              <div style={{ marginBottom: "12px" }}>
                <p
                  style={{
                    ...textStyles,
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "white",
                    margin: 0,
                    wordBreak: "break-word",
                  }}
                >
                  {title}
                </p>
                <p
                  style={{
                    ...textStyles,
                    fontSize: "14px",
                    color: "rgba(255,255,255,0.7)",
                    margin: 0,
                    wordBreak: "break-word",
                  }}
                >
                  {artist}
                </p>
              </div>
              <div style={{ marginBottom: showBranding || showSpotifyCode ? "16px" : 0 }}>
                {selectedLines.map(line => (
                  <p
                    key={line.id}
                    style={{
                      ...textStyles,
                      fontSize: "18px",
                      fontWeight: 600,
                      lineHeight: 1.5,
                      color: "white",
                      margin: "4px 0",
                    }}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
              {renderFooter()}
            </div>
          </div>
        )

      case "minimal":
        return (
          <div
            ref={cardRef}
            style={{
              ...cardBaseStyles,
              background: currentBackground,
              borderRadius: "24px",
              padding: "32px",
              maxWidth: "384px",
              margin: "0 auto",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {hasPattern && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  ...patternStyles,
                  pointerEvents: "none",
                }}
              />
            )}
            <div style={{ position: "relative" }}>
              <div style={{ marginBottom: showBranding || showSpotifyCode ? "24px" : 0 }}>
                {selectedLines.map(line => (
                  <p
                    key={line.id}
                    style={{
                      ...textStyles,
                      fontSize: "20px",
                      fontWeight: 600,
                      lineHeight: 1.6,
                      color: "white",
                      margin: "4px 0",
                    }}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.9)",
                      margin: 0,
                    }}
                  >
                    {title}
                  </p>
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.6)",
                      margin: 0,
                    }}
                  >
                    {artist}
                  </p>
                </div>
                {showBranding && (
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.4)",
                      margin: 0,
                    }}
                  >
                    scrolltunes.com
                  </p>
                )}
              </div>
              {showSpotifyCode && spotifyCodeUrl && (
                <div style={{ marginTop: "16px" }}>
                  <img
                    src={spotifyCodeUrl}
                    alt="Spotify Code"
                    crossOrigin="anonymous"
                    style={{ height: "24px", opacity: 0.7 }}
                  />
                </div>
              )}
            </div>
          </div>
        )

      case "centered":
        return (
          <div
            ref={cardRef}
            style={{
              ...cardBaseStyles,
              background: currentBackground,
              borderRadius: "24px",
              padding: "32px",
              maxWidth: "384px",
              margin: "0 auto",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {hasPattern && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  ...patternStyles,
                  pointerEvents: "none",
                }}
              />
            )}
            <div style={{ position: "relative" }}>
              {albumArt && (
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    margin: "0 auto 16px",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                  }}
                >
                  <img
                    src={albumArt}
                    alt=""
                    crossOrigin="anonymous"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              )}
              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    ...textStyles,
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "white",
                    margin: 0,
                  }}
                >
                  {title}
                </p>
                <p
                  style={{
                    ...textStyles,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.7)",
                    margin: 0,
                  }}
                >
                  {artist}
                </p>
              </div>
              <div style={{ marginBottom: showBranding || showSpotifyCode ? "20px" : 0 }}>
                {selectedLines.map(line => (
                  <p
                    key={line.id}
                    style={{
                      ...textStyles,
                      fontSize: "18px",
                      fontWeight: 600,
                      lineHeight: 1.5,
                      color: "white",
                      margin: "4px 0",
                    }}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
              {renderFooter()}
            </div>
          </div>
        )

      case "quote":
        return (
          <div
            ref={cardRef}
            style={{
              ...cardBaseStyles,
              background: currentBackground,
              borderRadius: "24px",
              padding: "32px",
              maxWidth: "384px",
              margin: "0 auto",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {hasPattern && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  ...patternStyles,
                  pointerEvents: "none",
                }}
              />
            )}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  fontSize: "64px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.15)",
                  lineHeight: 0.8,
                  marginBottom: "8px",
                  fontFamily: "Georgia, serif",
                }}
              >
                "
              </div>
              <div
                style={{
                  borderLeft: "3px solid rgba(255,255,255,0.3)",
                  paddingLeft: "16px",
                  marginBottom: showBranding || showSpotifyCode ? "24px" : 0,
                }}
              >
                {selectedLines.map(line => (
                  <p
                    key={line.id}
                    style={{
                      ...textStyles,
                      fontSize: "18px",
                      fontWeight: 500,
                      fontStyle: "italic",
                      lineHeight: 1.6,
                      color: "white",
                      margin: "4px 0",
                    }}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
                {albumArt && (
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={albumArt}
                      alt=""
                      crossOrigin="anonymous"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "white",
                      margin: 0,
                      wordBreak: "break-word",
                    }}
                  >
                    {title}
                  </p>
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.6)",
                      margin: 0,
                    }}
                  >
                    {artist}
                  </p>
                </div>
              </div>
              {(showBranding || showSpotifyCode) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "16px",
                  }}
                >
                  {showBranding && (
                    <p
                      style={{
                        ...textStyles,
                        fontSize: "10px",
                        color: "rgba(255,255,255,0.4)",
                        margin: 0,
                      }}
                    >
                      scrolltunes.com
                    </p>
                  )}
                  {showSpotifyCode && spotifyCodeUrl && (
                    <img
                      src={spotifyCodeUrl}
                      alt="Spotify Code"
                      crossOrigin="anonymous"
                      style={{ height: "20px", opacity: 0.7 }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )

      default:
        return (
          <div
            style={{
              height: scaledHeight !== null ? `${scaledHeight}px` : undefined,
              overflow: "visible",
              marginBottom: "-24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
                transformOrigin: "top center",
              }}
            >
              <div
                ref={cardCallbackRef}
                style={{
                  padding: "16px 16px 40px 16px",
                  background: "transparent",
                }}
              >
              <div
                style={{
                  ...cardBaseStyles,
                  background: currentBackground,
                  borderRadius: "24px",
                  padding: "24px",
                  maxWidth: expandedWidth ? "600px" : "384px",
                  width: expandedWidth ? (isEditing ? "600px" : "max-content") : "100%",
                  boxShadow: showShadow ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
            {hasPattern && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  ...patternStyles,
                  pointerEvents: "none",
                }}
              />
            )}
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    flexShrink: 0,
                    backgroundColor: "rgba(0,0,0,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {albumArt ? (
                    <img
                      src={albumArt}
                      alt=""
                      crossOrigin="anonymous"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <MusicNote size={24} weight="fill" style={{ color: "rgba(255,255,255,0.6)" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "white",
                      margin: 0,
                      wordBreak: "break-word",
                    }}
                  >
                    {title}
                  </p>
                  <p
                    style={{
                      ...textStyles,
                      fontSize: "14px",
                      color: "rgba(255,255,255,0.7)",
                      margin: 0,
                      wordBreak: "break-word",
                    }}
                  >
                    {artist}
                  </p>
                </div>
              </div>
              <div style={{ marginBottom: showBranding || showSpotifyCode ? "16px" : 0 }}>
                {selectedLines.map(line =>
                  isEditing ? (
                    <input
                      key={line.id}
                      type="text"
                      value={getLineText(line)}
                      onChange={e => updateLineText(line.id, e.target.value)}
                      style={{
                        ...textStyles,
                        fontSize: "18px",
                        fontWeight: 600,
                        lineHeight: 1.5,
                        color: "white",
                        margin: "4px 0",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.3)",
                        borderRadius: "4px",
                        padding: "2px 6px",
                        width: "100%",
                        display: "block",
                        outline: "none",
                      }}
                    />
                  ) : (
                    <p
                      key={line.id}
                      style={{
                        ...textStyles,
                        fontSize: "18px",
                        fontWeight: 600,
                        lineHeight: 1.5,
                        color: "white",
                        margin: "4px 0",
                      }}
                    >
                      {getLineText(line)}
                    </p>
                  ),
                )}
              </div>
              {renderFooter()}
            </div>
            </div>
          </div>
          </div>
        </div>
        )
    }
  }

  const renderFooter = () => {
    if (!showBranding && !showSpotifyCode) return null

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        {showBranding && (
          <p
            style={{
              ...textStyles,
              fontSize: "12px",
              color: "rgba(255,255,255,0.5)",
              margin: 0,
            }}
          >
            scrolltunes.com
          </p>
        )}
        {showSpotifyCode && spotifyCodeUrl && (
          <img
            src={spotifyCodeUrl}
            alt="Spotify Code"
            crossOrigin="anonymous"
            style={{ height: "24px", opacity: 0.8 }}
          />
        )}
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={e => {
            e.stopPropagation()
            handleBackdropClick(e)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springs.default}
            className="relative mx-0 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-neutral-900 shadow-xl sm:mx-4 sm:max-w-lg sm:rounded-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center gap-3">
                {step === "preview" && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 transition-colors hover:bg-neutral-700"
                    aria-label="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h2 className="text-lg font-semibold">
                  {step === "select" ? "Select Lyrics" : "Customize Card"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-neutral-800"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
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
                      Tap lines to include in your card
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
                    <div ref={previewContainerRef} className="share-modal-preserve relative rounded-2xl bg-neutral-200 p-6">
                      <div className="absolute left-2 top-2 z-10 flex gap-1">
                        <button
                          type="button"
                          onClick={() => setIsEditing(prev => !prev)}
                          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                            isEditing
                              ? "bg-indigo-600 text-white"
                              : "bg-black/40 text-white/80 hover:bg-black/60 hover:text-white"
                          }`}
                          aria-label={isEditing ? "Done editing" : "Edit text"}
                        >
                          {isEditing ? (
                            <Check size={18} weight="bold" />
                          ) : (
                            <PencilSimple size={18} weight="bold" />
                          )}
                        </button>
                        {isEditing && editedLines.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setEditedLines(new Map())}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
                            aria-label="Reset text"
                          >
                            <ArrowCounterClockwise size={18} weight="bold" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedWidth(prev => !prev)}
                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
                        aria-label={expandedWidth ? "Shrink width" : "Expand width"}
                      >
                        {expandedWidth ? (
                          <ArrowsIn size={18} weight="bold" />
                        ) : (
                          <ArrowsOut size={18} weight="bold" />
                        )}
                      </button>
                      {renderCardContent()}
                    </div>

                    {/* Options */}
                    <div className="mt-4 space-y-4">
                      {/* Layout - hidden for now, may re-enable later
                      <div>
                        <p className="mb-2 text-sm text-neutral-400">Layout</p>
                        <div className="flex flex-wrap gap-2">
                          {LAYOUT_OPTIONS.map(option => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setLayout(option.id)}
                              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                layout === option.id
                                  ? "bg-indigo-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      */}

                      {/* Background color */}
                      <div>
                        <p className="mb-2 text-sm text-neutral-400">Background</p>
                        <div className="share-modal-preserve flex flex-wrap items-center gap-2">
                          {gradientPalette.map(option => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setSelectedGradientId(option.id)}
                              className="relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                              style={{
                                background: option.gradient,
                                borderColor:
                                  selectedGradientId === option.id
                                    ? "white"
                                    : "rgba(255,255,255,0.2)",
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

                      {/* Pattern */}
                      <div>
                        <p className="mb-2 text-sm text-neutral-400">Pattern</p>
                        <div className="flex flex-wrap gap-2">
                          {PATTERN_OPTIONS.map(option => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                if (option.id === "random" && pattern === "random") {
                                  setPatternSeed(Date.now())
                                } else {
                                  setPattern(option.id)
                                }
                              }}
                              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                pattern === option.id
                                  ? "bg-indigo-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Toggles */}
                      <div className="space-y-3">
                        {/* Shadow toggle */}
                        <label className="flex cursor-pointer items-center gap-3">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={showShadow}
                              onChange={e => setShowShadow(e.target.checked)}
                              className="sr-only"
                            />
                            <div
                              className={`h-6 w-11 rounded-full transition-colors ${
                                showShadow ? "bg-indigo-600" : "bg-neutral-700"
                              }`}
                            />
                            <div
                              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                                showShadow ? "translate-x-5" : ""
                              }`}
                            />
                          </div>
                          <span className="text-sm text-neutral-300">Drop shadow</span>
                        </label>

                        {/* Spotify code toggle */}
                        {spotifyId && (
                          <label className="flex cursor-pointer items-center gap-3">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={showSpotifyCode}
                                onChange={e => setShowSpotifyCode(e.target.checked)}
                                className="sr-only"
                              />
                              <div
                                className={`h-6 w-11 rounded-full transition-colors ${
                                  showSpotifyCode ? "bg-indigo-600" : "bg-neutral-700"
                                }`}
                              />
                              <div
                                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                                  showSpotifyCode ? "translate-x-5" : ""
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-neutral-300">Show Spotify Code</span>
                              <a
                                href="https://www.spotifycodes.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-600 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-300"
                                aria-label="Learn about Spotify Codes"
                                onClick={e => e.stopPropagation()}
                              >
                                <Question size={12} weight="bold" />
                              </a>
                            </div>
                          </label>
                        )}

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
                          <span className="flex items-center gap-1.5 text-sm text-neutral-300">
                            Show scrolltunes.com
                            <span title="Thank you!">
                              <Heart size={14} weight="fill" className="text-red-400" />
                            </span>
                          </span>
                        </label>
                      </div>
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
