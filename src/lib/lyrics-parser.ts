/**
 * LRC lyrics file parser
 *
 * Parses standard LRC format into Lyrics structure
 * Reference: https://en.wikipedia.org/wiki/LRC_(file_format)
 */

import type { Lyrics, LyricLine } from "@/core"

/**
 * LRC metadata that can be extracted from the file
 */
export interface LRCMetadata {
  readonly title?: string
  readonly artist?: string
  readonly album?: string
  readonly length?: string
}

/**
 * Parse a timestamp string [mm:ss.xx] to seconds
 */
export function parseTimestamp(timestamp: string): number {
  const match = timestamp.match(/\[(\d+):(\d+)(?:\.(\d+))?\]/)
  if (!match) return 0

  const minutes = Number.parseInt(match[1] ?? "0", 10)
  const seconds = Number.parseInt(match[2] ?? "0", 10)
  const centiseconds = Number.parseInt((match[3] ?? "0").padEnd(2, "0").slice(0, 2), 10)

  return minutes * 60 + seconds + centiseconds / 100
}

/**
 * Parse LRC content into Lyrics structure
 */
export function parseLRC(
  content: string,
  songId: string,
  defaultTitle = "Unknown",
  defaultArtist = "Unknown",
): Lyrics {
  const lines = content.split(/\r?\n/)
  const metadata: { title?: string; artist?: string; album?: string; length?: string } = {}
  const lyricLines: Array<{ time: number; text: string }> = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Parse metadata tags
    const metaMatch = trimmed.match(/\[(\w+):(.+)\]/)
    if (metaMatch && !trimmed.match(/\[\d+:\d+/)) {
      const [, tag, value] = metaMatch
      if (tag && value) {
        switch (tag.toLowerCase()) {
          case "ti":
            metadata.title = value.trim()
            break
          case "ar":
            metadata.artist = value.trim()
            break
          case "al":
            metadata.album = value.trim()
            break
          case "length":
            metadata.length = value.trim()
            break
        }
      }
      continue
    }

    // Parse lyric lines with timestamps
    // Format: [mm:ss.xx]text or [mm:ss.xx][mm:ss.xx]text (multiple timestamps)
    const timestampRegex = /\[(\d+:\d+(?:\.\d+)?)\]/g
    const timestamps: number[] = []
    let match: RegExpExecArray | null
    let lastIndex = 0

    while ((match = timestampRegex.exec(trimmed)) !== null) {
      timestamps.push(parseTimestamp(match[0]))
      lastIndex = match.index + match[0].length
    }

    if (timestamps.length > 0) {
      const text = trimmed.slice(lastIndex).trim()
      for (const time of timestamps) {
        lyricLines.push({ time, text })
      }
    }
  }

  // Sort by time
  lyricLines.sort((a, b) => a.time - b.time)

  // Convert to LyricLine format with end times
  const result: LyricLine[] = []
  for (let i = 0; i < lyricLines.length; i++) {
    const current = lyricLines[i]
    const next = lyricLines[i + 1]
    if (current) {
      result.push({
        id: `line-${i}`,
        text: current.text,
        startTime: current.time,
        endTime: next?.time ?? current.time + 5, // Default 5s if last line
      })
    }
  }

  // Calculate duration from metadata or last line
  let duration = 0
  if (metadata.length) {
    const parts = metadata.length.split(":")
    if (parts.length === 2) {
      duration = Number.parseInt(parts[0] ?? "0", 10) * 60 + Number.parseInt(parts[1] ?? "0", 10)
    }
  }
  if (duration === 0 && result.length > 0) {
    const lastLine = result[result.length - 1]
    duration = lastLine ? lastLine.endTime : 0
  }

  return {
    songId,
    title: metadata.title ?? defaultTitle,
    artist: metadata.artist ?? defaultArtist,
    lines: result,
    duration,
  }
}

/**
 * Format seconds to LRC timestamp format [mm:ss.xx]
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const wholeSecs = Math.floor(secs)
  const centisecs = Math.round((secs - wholeSecs) * 100)
  return `[${mins.toString().padStart(2, "0")}:${wholeSecs.toString().padStart(2, "0")}.${centisecs.toString().padStart(2, "0")}]`
}
