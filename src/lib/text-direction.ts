/**
 * RTL (Right-to-Left) text direction detection
 *
 * Detects if text is in an RTL language by checking for RTL Unicode ranges.
 * Used to flip word-by-word highlight animation direction for Hebrew, Arabic, etc.
 */

const RTL_REGEX =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/**
 * Check if a string contains RTL characters
 */
export function containsRTL(text: string): boolean {
  return RTL_REGEX.test(text)
}

/**
 * Detect if lyrics are predominantly RTL by sampling lines
 *
 * Checks up to maxSamples non-empty lines and returns true if
 * more than half contain RTL characters.
 */
export function detectLyricsDirection(
  lines: readonly { readonly text: string }[],
  maxSamples = 10,
): "ltr" | "rtl" {
  const nonEmptyLines = lines.filter(line => line.text.trim() !== "")
  const samplesToCheck = Math.min(maxSamples, nonEmptyLines.length)

  if (samplesToCheck === 0) return "ltr"

  let rtlCount = 0
  for (let i = 0; i < samplesToCheck; i++) {
    const line = nonEmptyLines[i]
    if (line && containsRTL(line.text)) {
      rtlCount++
    }
  }

  return rtlCount > samplesToCheck / 2 ? "rtl" : "ltr"
}
