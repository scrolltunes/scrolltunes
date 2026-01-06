"use client"

import * as htmlToImage from "html-to-image"
import { useCallback, useState } from "react"
import type { ExportFormat, ExportSettings } from "./types"

export interface UseShareExportOptions {
  readonly cardRef: React.RefObject<HTMLDivElement | null>
  readonly title: string
  readonly artist: string
  readonly settings: ExportSettings
}

export interface UseShareExportResult {
  readonly isGenerating: boolean
  readonly isSharing: boolean
  readonly isCopied: boolean
  readonly generateImage: () => Promise<Blob | null>
  readonly handleDownload: () => Promise<void>
  readonly handleCopy: () => Promise<void>
  readonly handleShare: () => Promise<void>
}

function getMimeType(format: ExportFormat): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    default:
      return "image/png"
  }
}

function getFileExtension(format: ExportFormat): string {
  return format
}

export function useShareExport({
  cardRef,
  title,
  artist,
  settings,
}: UseShareExportOptions): UseShareExportResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const generateImage = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null

    setIsGenerating(true)

    try {
      const baseOptions = {
        quality: settings.format === "jpeg" ? 0.95 : 1,
        pixelRatio: settings.pixelRatio,
        cacheBust: true,
        style: {
          fontKerning: "none",
          letterSpacing: "0px",
        },
        fontEmbedCSS: "",
      }

      let dataUrl: string

      switch (settings.format) {
        case "jpeg":
          dataUrl = await htmlToImage.toJpeg(cardRef.current, {
            ...baseOptions,
            backgroundColor: "#000000",
          })
          break
        case "webp":
          // html-to-image doesn't have native webp, use canvas conversion
          dataUrl = await htmlToImage.toPng(cardRef.current, baseOptions)
          break
        default:
          dataUrl = await htmlToImage.toPng(cardRef.current, baseOptions)
          break
      }

      // Convert to blob
      const response = await fetch(dataUrl)
      const blob = await response.blob()

      // For webp, we need to convert the PNG blob
      if (settings.format === "webp") {
        return new Promise(resolve => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement("canvas")
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext("2d")
            if (!ctx) {
              resolve(blob) // Fallback to PNG
              return
            }
            ctx.drawImage(img, 0, 0)
            canvas.toBlob(
              webpBlob => resolve(webpBlob ?? blob),
              "image/webp",
              0.95,
            )
          }
          img.onerror = () => resolve(blob)
          img.src = dataUrl
        })
      }

      return blob
    } catch (error) {
      console.error("Failed to generate image:", error)
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [cardRef, settings])

  const handleDownload = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${title} - ${artist} lyrics.${getFileExtension(settings.format)}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [generateImage, title, artist, settings.format])

  const handleCopy = useCallback(async () => {
    setIsCopied(true)

    const blob = await generateImage()
    if (!blob) {
      setIsCopied(false)
      return
    }

    try {
      // Clipboard API only supports PNG reliably
      const pngBlob =
        settings.format === "png"
          ? blob
          : await (async () => {
              // Re-generate as PNG for clipboard
              if (!cardRef.current) return blob
              const dataUrl = await htmlToImage.toPng(cardRef.current, {
                quality: 1,
                pixelRatio: settings.pixelRatio,
                cacheBust: true,
              })
              const response = await fetch(dataUrl)
              return response.blob()
            })()

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngBlob,
        }),
      ])

      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error("Copy failed:", error)
      setIsCopied(false)
    }
  }, [generateImage, cardRef, settings])

  const handleShare = useCallback(async () => {
    if (isSharing) return

    setIsSharing(true)

    try {
      const blob = await generateImage()
      if (!blob) {
        setIsSharing(false)
        return
      }

      const file = new File(
        [blob],
        `${title} - ${artist} lyrics.${getFileExtension(settings.format)}`,
        { type: getMimeType(settings.format) },
      )

      const shareSupported =
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        "canShare" in navigator

      if (shareSupported && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${title} by ${artist}`,
        })
      } else {
        // Fallback to download
        await handleDownload()
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Share failed:", error)
      }
    } finally {
      setIsSharing(false)
    }
  }, [generateImage, title, artist, settings.format, handleDownload, isSharing])

  return {
    isGenerating,
    isSharing,
    isCopied,
    generateImage,
    handleDownload,
    handleCopy,
    handleShare,
  }
}
