"use client"

import { Circle, Eye, EyeSlash, MusicNote, Square, TextAa } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback, useId } from "react"
import type {
  AlbumArtElementConfig,
  BrandingElementConfig,
  ElementsConfig,
  LyricsElementConfig,
  MetadataElementConfig,
  SpotifyCodeElementConfig,
} from "../types"
import { ColorPicker } from "./ColorPicker"
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl"
import { Slider } from "./Slider"

// ============================================================================
// Types
// ============================================================================

type ElementKey = keyof ElementsConfig

interface ElementSectionProps<T> {
  readonly label: string
  readonly icon: React.ReactNode
  readonly visible: boolean
  readonly onToggleVisibility: () => void
  readonly children: React.ReactNode
}

// ============================================================================
// Shape Options
// ============================================================================

const SHAPE_OPTIONS: readonly SegmentedOption<"square" | "rounded" | "circle">[] = [
  { value: "square", label: "Square", icon: <Square size={14} /> },
  { value: "rounded", label: "Rounded", icon: <Square size={14} weight="regular" /> },
  { value: "circle", label: "Circle", icon: <Circle size={14} /> },
] as const

// ============================================================================
// Element Section Component
// ============================================================================

const ElementSection = memo(function ElementSection<T>({
  label,
  icon,
  visible,
  onToggleVisibility,
  children,
}: ElementSectionProps<T>) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--color-surface2)" }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggleVisibility}
        className="w-full flex items-center justify-between px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ color: "var(--color-text1)" }}
        aria-pressed={visible}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: visible ? "var(--color-accent)" : "var(--color-text3)" }}>
            {icon}
          </span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <motion.span
          animate={{ opacity: visible ? 1 : 0.5 }}
          style={{ color: visible ? "var(--color-text2)" : "var(--color-text3)" }}
        >
          {visible ? <Eye size={16} /> : <EyeSlash size={16} />}
        </motion.span>
      </button>

      {/* Content */}
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="px-3 pb-3"
        >
          <div
            className="pt-2 flex flex-col gap-3"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export interface ElementsControlsProps {
  readonly elements: ElementsConfig
  readonly hasAlbumArt: boolean
  readonly hasSpotifyId: boolean
  readonly onElementChange: <K extends ElementKey>(
    element: K,
    config: Partial<ElementsConfig[K]>,
  ) => void
  readonly onToggleVisibility: (element: ElementKey) => void
}

export const ElementsControls = memo(function ElementsControls({
  elements,
  hasAlbumArt,
  hasSpotifyId,
  onElementChange,
  onToggleVisibility,
}: ElementsControlsProps) {
  const brandingInputId = useId()

  // -------------------------------------------------------------------------
  // Album Art Handlers
  // -------------------------------------------------------------------------

  const handleAlbumArtChange = useCallback(
    (config: Partial<AlbumArtElementConfig>) => {
      onElementChange("albumArt", config)
    },
    [onElementChange],
  )

  // -------------------------------------------------------------------------
  // Metadata Handlers
  // -------------------------------------------------------------------------

  const handleMetadataChange = useCallback(
    (config: Partial<MetadataElementConfig>) => {
      onElementChange("metadata", config)
    },
    [onElementChange],
  )

  // -------------------------------------------------------------------------
  // Lyrics Handlers
  // -------------------------------------------------------------------------

  const handleLyricsChange = useCallback(
    (config: Partial<LyricsElementConfig>) => {
      onElementChange("lyrics", config)
    },
    [onElementChange],
  )

  // -------------------------------------------------------------------------
  // Spotify Code Handlers
  // -------------------------------------------------------------------------

  const handleSpotifyCodeChange = useCallback(
    (config: Partial<SpotifyCodeElementConfig>) => {
      onElementChange("spotifyCode", config)
    },
    [onElementChange],
  )

  // -------------------------------------------------------------------------
  // Branding Handlers
  // -------------------------------------------------------------------------

  const handleBrandingChange = useCallback(
    (config: Partial<BrandingElementConfig>) => {
      onElementChange("branding", config)
    },
    [onElementChange],
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Album Art */}
      <ElementSection
        label="Album Art"
        icon={<MusicNote size={16} />}
        visible={elements.albumArt.visible}
        onToggleVisibility={() => onToggleVisibility("albumArt")}
      >
        {!hasAlbumArt && (
          <div
            className="px-2 py-1.5 rounded text-xs"
            style={{
              background: "var(--color-warning-soft)",
              color: "var(--color-warning)",
            }}
          >
            No album art available
          </div>
        )}
        <Slider
          label="Size"
          value={elements.albumArt.size}
          min={32}
          max={120}
          step={4}
          onChange={size => handleAlbumArtChange({ size })}
          formatValue={v => `${v}px`}
          disabled={!hasAlbumArt}
        />
        <SegmentedControl
          label="Shape"
          options={SHAPE_OPTIONS}
          value={elements.albumArt.shape}
          onChange={shape => handleAlbumArtChange({ shape })}
          size="sm"
          disabled={!hasAlbumArt}
        />
        <Slider
          label="Opacity"
          value={elements.albumArt.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={opacity => handleAlbumArtChange({ opacity })}
          formatValue={v => `${Math.round(v * 100)}%`}
          disabled={!hasAlbumArt}
        />
      </ElementSection>

      {/* Metadata */}
      <ElementSection
        label="Song Info"
        icon={<TextAa size={16} />}
        visible={elements.metadata.visible}
        onToggleVisibility={() => onToggleVisibility("metadata")}
      >
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={elements.metadata.showTitle}
              onChange={e => handleMetadataChange({ showTitle: e.target.checked })}
              className="w-4 h-4 rounded accent-[var(--color-accent)]"
            />
            <span className="text-xs" style={{ color: "var(--color-text2)" }}>
              Title
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={elements.metadata.showArtist}
              onChange={e => handleMetadataChange({ showArtist: e.target.checked })}
              className="w-4 h-4 rounded accent-[var(--color-accent)]"
            />
            <span className="text-xs" style={{ color: "var(--color-text2)" }}>
              Artist
            </span>
          </label>
        </div>
        <Slider
          label="Font Size"
          value={elements.metadata.fontSize}
          min={10}
          max={24}
          step={1}
          onChange={fontSize => handleMetadataChange({ fontSize })}
          formatValue={v => `${v}px`}
        />
        <ColorPicker
          label="Color"
          value={elements.metadata.color}
          onChange={color => handleMetadataChange({ color })}
        />
      </ElementSection>

      {/* Lyrics */}
      <ElementSection
        label="Lyrics"
        icon={<TextAa size={16} weight="bold" />}
        visible={elements.lyrics.visible}
        onToggleVisibility={() => onToggleVisibility("lyrics")}
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={elements.lyrics.wrapText}
            onChange={e => handleLyricsChange({ wrapText: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--color-accent)]"
          />
          <span className="text-xs" style={{ color: "var(--color-text2)" }}>
            Wrap text
          </span>
        </label>
        {elements.lyrics.wrapText && (
          <Slider
            label="Max Width"
            value={elements.lyrics.maxWidth ?? 300}
            min={150}
            max={500}
            step={10}
            onChange={maxWidth => handleLyricsChange({ maxWidth })}
            formatValue={v => `${v}px`}
          />
        )}
        <Slider
          label="Opacity"
          value={elements.lyrics.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={opacity => handleLyricsChange({ opacity })}
          formatValue={v => `${Math.round(v * 100)}%`}
        />
      </ElementSection>

      {/* Spotify Code */}
      {hasSpotifyId && (
        <ElementSection
          label="Spotify Code"
          icon={
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          }
          visible={elements.spotifyCode.visible}
          onToggleVisibility={() => onToggleVisibility("spotifyCode")}
        >
          <Slider
            label="Size"
            value={elements.spotifyCode.size}
            min={16}
            max={48}
            step={2}
            onChange={size => handleSpotifyCodeChange({ size })}
            formatValue={v => `${v}px`}
          />
          <Slider
            label="Opacity"
            value={elements.spotifyCode.opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={opacity => handleSpotifyCodeChange({ opacity })}
            formatValue={v => `${Math.round(v * 100)}%`}
          />
        </ElementSection>
      )}

      {/* Branding */}
      <ElementSection
        label="Branding"
        icon={<TextAa size={16} />}
        visible={elements.branding.visible}
        onToggleVisibility={() => onToggleVisibility("branding")}
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={brandingInputId}
            className="text-xs font-medium"
            style={{ color: "var(--color-text2)" }}
          >
            Text
          </label>
          <input
            id={brandingInputId}
            type="text"
            value={elements.branding.text}
            onChange={e => handleBrandingChange({ text: e.target.value })}
            placeholder="ScrollTunes"
            maxLength={30}
            className="px-2 py-1.5 rounded-md text-xs focus:outline-none focus-visible:ring-2"
            style={{
              background: "var(--color-surface3)",
              color: "var(--color-text1)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={elements.branding.showEmoji}
            onChange={e => handleBrandingChange({ showEmoji: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--color-accent)]"
          />
          <span className="text-xs" style={{ color: "var(--color-text2)" }}>
            Show emoji
          </span>
        </label>
        <Slider
          label="Opacity"
          value={elements.branding.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={opacity => handleBrandingChange({ opacity })}
          formatValue={v => `${Math.round(v * 100)}%`}
        />
      </ElementSection>
    </div>
  )
})
