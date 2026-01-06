/**
 * Color extraction and palette building utilities for shareable lyrics cards
 */

interface RGB {
  r: number
  g: number
  b: number
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null
  const r = result[1]
  const g = result[2]
  const b = result[3]
  if (r === undefined || g === undefined || b === undefined) return null
  return {
    r: Number.parseInt(r, 16),
    g: Number.parseInt(g, 16),
    b: Number.parseInt(b, 16),
  }
}

/**
 * Extract dominant color from an image URL using canvas sampling
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        resolve("#1a1a2e")
        return
      }

      const size = 50
      canvas.width = size
      canvas.height = size
      ctx.drawImage(img, 0, 0, size, size)

      try {
        const imageData = ctx.getImageData(0, 0, size, size)
        const { data } = imageData

        let totalR = 0
        let totalG = 0
        let totalB = 0
        let count = 0

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]

          if (r !== undefined && g !== undefined && b !== undefined && a !== undefined && a > 128) {
            totalR += r
            totalG += g
            totalB += b
            count++
          }
        }

        if (count === 0) {
          resolve("#1a1a2e")
          return
        }

        const avgR = Math.round(totalR / count)
        const avgG = Math.round(totalG / count)
        const avgB = Math.round(totalB / count)

        resolve(rgbToHex({ r: avgR, g: avgG, b: avgB }))
      } catch {
        resolve("#1a1a2e")
      }
    }

    img.onerror = () => {
      resolve("#1a1a2e")
    }

    img.src = imageUrl
  })
}

/**
 * Build a color palette from a base color with variations
 */
export function buildPalette(baseColor: string): readonly string[] {
  const rgb = hexToRgb(baseColor)
  if (!rgb) {
    return DEFAULT_PALETTE
  }

  const darken = (color: RGB, factor: number): RGB => ({
    r: Math.max(0, Math.round(color.r * factor)),
    g: Math.max(0, Math.round(color.g * factor)),
    b: Math.max(0, Math.round(color.b * factor)),
  })

  const lighten = (color: RGB, factor: number): RGB => ({
    r: Math.min(255, Math.round(color.r + (255 - color.r) * factor)),
    g: Math.min(255, Math.round(color.g + (255 - color.g) * factor)),
    b: Math.min(255, Math.round(color.b + (255 - color.b) * factor)),
  })

  const shiftHue = (color: RGB, shift: number): RGB => {
    const max = Math.max(color.r, color.g, color.b)
    const min = Math.min(color.r, color.g, color.b)

    if (max === min) return color

    let h = 0
    const d = max - min

    if (max === color.r) {
      h = ((color.g - color.b) / d + (color.g < color.b ? 6 : 0)) / 6
    } else if (max === color.g) {
      h = ((color.b - color.r) / d + 2) / 6
    } else {
      h = ((color.r - color.g) / d + 4) / 6
    }

    const s = d / max
    const v = max / 255

    h = (h + shift) % 1
    if (h < 0) h += 1

    const i = Math.floor(h * 6)
    const f = h * 6 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)

    let r = 0
    let g = 0
    let b = 0

    switch (i % 6) {
      case 0:
        r = v
        g = t
        b = p
        break
      case 1:
        r = q
        g = v
        b = p
        break
      case 2:
        r = p
        g = v
        b = t
        break
      case 3:
        r = p
        g = q
        b = v
        break
      case 4:
        r = t
        g = p
        b = v
        break
      case 5:
        r = v
        g = p
        b = q
        break
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    }
  }

  return [
    baseColor,
    rgbToHex(darken(rgb, 0.6)),
    rgbToHex(lighten(rgb, 0.2)),
    rgbToHex(shiftHue(rgb, 0.1)),
    rgbToHex(shiftHue(darken(rgb, 0.7), -0.1)),
    "#1a1a2e",
    "#2d2d44",
    "#0f0f1a",
  ] as const
}

export const DEFAULT_PALETTE = [
  "#1a1a2e",
  "#16213e",
  "#0f3460",
  "#533483",
  "#e94560",
  "#2d2d44",
  "#1f1f2e",
  "#0f0f1a",
] as const

export interface GradientOption {
  readonly id: string
  readonly gradient: string
  readonly previewColors: readonly [string, string]
}

function shiftHueRgb(color: RGB, degrees: number): RGB {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  const l = (max + min) / 2 / 255

  if (max === min) return color

  const d = (max - min) / 255
  const s = l > 0.5 ? d / (2 - (max + min) / 255) : d / ((max + min) / 255)

  let h = 0
  if (max === color.r) {
    h = ((color.g - color.b) / (max - min) + (color.g < color.b ? 6 : 0)) / 6
  } else if (max === color.g) {
    h = ((color.b - color.r) / (max - min) + 2) / 6
  } else {
    h = ((color.r - color.g) / (max - min) + 4) / 6
  }

  h = (h + degrees / 360) % 1
  if (h < 0) h += 1

  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t
    if (tNorm < 0) tNorm += 1
    if (tNorm > 1) tNorm -= 1
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm
    if (tNorm < 1 / 2) return q
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

function darkenRgb(color: RGB, factor: number): RGB {
  return {
    r: Math.max(0, Math.round(color.r * (1 - factor))),
    g: Math.max(0, Math.round(color.g * (1 - factor))),
    b: Math.max(0, Math.round(color.b * (1 - factor))),
  }
}

function lightenRgb(color: RGB, factor: number): RGB {
  return {
    r: Math.min(255, Math.round(color.r + (255 - color.r) * factor)),
    g: Math.min(255, Math.round(color.g + (255 - color.g) * factor)),
    b: Math.min(255, Math.round(color.b + (255 - color.b) * factor)),
  }
}

function saturateRgb(color: RGB, factor: number): RGB {
  const gray = (color.r + color.g + color.b) / 3
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r + (color.r - gray) * factor))),
    g: Math.min(255, Math.max(0, Math.round(color.g + (color.g - gray) * factor))),
    b: Math.min(255, Math.max(0, Math.round(color.b + (color.b - gray) * factor))),
  }
}

function getBrightness(color: RGB): number {
  // Perceived brightness formula (ITU-R BT.709)
  return (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) / 255
}

function getSaturation(color: RGB): number {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  if (max === 0) return 0
  return (max - min) / max
}

// Vibrant preset gradients for dark album art
const VIBRANT_GRADIENTS: GradientOption[] = [
  {
    id: "indigo-purple",
    gradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    previewColors: ["#4f46e5", "#7c3aed"],
  },
  {
    id: "blue-cyan",
    gradient: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    previewColors: ["#2563eb", "#06b6d4"],
  },
  {
    id: "rose-orange",
    gradient: "linear-gradient(135deg, #e11d48 0%, #f97316 100%)",
    previewColors: ["#e11d48", "#f97316"],
  },
  {
    id: "emerald-teal",
    gradient: "linear-gradient(135deg, #059669 0%, #14b8a6 100%)",
    previewColors: ["#059669", "#14b8a6"],
  },
  {
    id: "amber-yellow",
    gradient: "linear-gradient(135deg, #d97706 0%, #eab308 100%)",
    previewColors: ["#d97706", "#eab308"],
  },
  {
    id: "fuchsia-pink",
    gradient: "linear-gradient(135deg, #c026d3 0%, #ec4899 100%)",
    previewColors: ["#c026d3", "#ec4899"],
  },
]

// Dark preset gradients - made more distinct from each other
const DARK_GRADIENTS: GradientOption[] = [
  {
    id: "midnight-blue",
    gradient: "linear-gradient(135deg, #1e3a5f 0%, #0a1628 100%)",
    previewColors: ["#1e3a5f", "#0a1628"],
  },
  {
    id: "charcoal",
    gradient: "linear-gradient(135deg, #374151 0%, #111827 100%)",
    previewColors: ["#374151", "#111827"],
  },
]

/**
 * Build a gradient palette from a base color (hex) for shareable cards.
 * First 2 swatches use complementary colors that contrast with the album art.
 */
export function buildGradientPalette(baseColor: string | null): GradientOption[] {
  const rgb = baseColor ? hexToRgb(baseColor) : null

  if (!rgb) {
    // No album art color - return default vibrant + dark gradients
    return [...VIBRANT_GRADIENTS, ...DARK_GRADIENTS]
  }

  const brightness = getBrightness(rgb)
  const saturation = getSaturation(rgb)
  const isGrayish = saturation < 0.2

  // For grayish album art, prioritize vibrant presets since album-derived colors
  // will all look similar (gray on gray)
  if (isGrayish) {
    return [...VIBRANT_GRADIENTS, ...DARK_GRADIENTS]
  }

  // Create complementary colors that contrast with the album art
  // These won't get "swallowed" by the album background

  // Complementary: 180 degrees opposite on color wheel
  const complementary = shiftHueRgb(rgb, 180)
  // Split-complementary: 150 degrees (next to complementary)
  const splitComplementary = shiftHueRgb(rgb, 150)

  // Adjust brightness/saturation for good contrast
  // If album is dark, make gradients vibrant; if light, make them rich
  const adjustColor = (color: RGB): RGB => {
    let adjusted = color

    // Ensure good saturation
    adjusted = saturateRgb(adjusted, 0.5)

    // Adjust brightness for contrast
    if (brightness < 0.4) {
      // Dark album: lighten the complementary colors
      adjusted = lightenRgb(adjusted, 0.3)
    } else if (brightness > 0.6) {
      // Light album: darken the complementary colors
      adjusted = darkenRgb(adjusted, 0.3)
    }

    // Ensure minimum brightness for visibility
    if (getBrightness(adjusted) < 0.25) {
      adjusted = lightenRgb(adjusted, 0.2)
    }

    return adjusted
  }

  const comp1 = adjustColor(complementary)
  const comp1Dark = darkenRgb(comp1, 0.3)
  const comp2 = adjustColor(splitComplementary)
  const comp2Dark = darkenRgb(comp2, 0.3)

  const comp1Hex = rgbToHex(comp1)
  const comp1DarkHex = rgbToHex(comp1Dark)
  const comp2Hex = rgbToHex(comp2)
  const comp2DarkHex = rgbToHex(comp2Dark)

  return [
    // First 2: Complementary gradients that contrast with album art
    {
      id: "album-complementary",
      gradient: `linear-gradient(135deg, ${comp1Hex} 0%, ${comp1DarkHex} 100%)`,
      previewColors: [comp1Hex, comp1DarkHex],
    },
    {
      id: "album-split-complementary",
      gradient: `linear-gradient(135deg, ${comp2Hex} 0%, ${comp2DarkHex} 100%)`,
      previewColors: [comp2Hex, comp2DarkHex],
    },
    // Vibrant presets
    ...VIBRANT_GRADIENTS.slice(0, 4),
    // Dark presets
    ...DARK_GRADIENTS,
  ]
}
