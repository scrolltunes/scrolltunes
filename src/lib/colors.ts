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
 * Convert RGB to HSL for better color manipulation
 */
function rgbToHsl(color: RGB): { h: number; s: number; l: number } {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6
  } else {
    h = ((r - g) / d + 4) / 6
  }

  return { h: h * 360, s, l }
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  const hNorm = h / 360

  if (s === 0) {
    const gray = Math.round(l * 255)
    return { r: gray, g: gray, b: gray }
  }

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
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  }
}

/**
 * Build a gradient palette from a base color (hex) for shareable cards.
 * Dark presets first, then vibrant presets, then album-derived colors last.
 */
export function buildGradientPalette(baseColor: string | null): GradientOption[] {
  const rgb = baseColor ? hexToRgb(baseColor) : null

  if (!rgb) {
    // No album art color - return default dark + vibrant gradients
    return [...DARK_GRADIENTS, ...VIBRANT_GRADIENTS]
  }

  const hsl = rgbToHsl(rgb)

  // For very desaturated colors, still create derived colors but boost saturation
  const baseSaturation = Math.max(hsl.s, 0.6) // Ensure minimum 60% saturation

  // Complementary color (180° opposite)
  const comp1Hue = (hsl.h + 180) % 360
  const comp1Light = hslToRgb(comp1Hue, baseSaturation, 0.55)
  const comp1Dark = hslToRgb(comp1Hue, baseSaturation * 0.9, 0.3)

  // Triadic color (120° shift) for contrast
  const comp2Hue = (hsl.h + 120) % 360
  const comp2Light = hslToRgb(comp2Hue, baseSaturation, 0.5)
  const comp2Dark = hslToRgb(comp2Hue, baseSaturation * 0.9, 0.28)

  const comp1LightHex = rgbToHex(comp1Light)
  const comp1DarkHex = rgbToHex(comp1Dark)
  const comp2LightHex = rgbToHex(comp2Light)
  const comp2DarkHex = rgbToHex(comp2Dark)

  return [
    // Dark presets first
    ...DARK_GRADIENTS,
    // Vibrant presets
    ...VIBRANT_GRADIENTS.slice(0, 4),
    // Album-derived contrasting gradients last
    {
      id: "album-complementary",
      gradient: `linear-gradient(135deg, ${comp1LightHex} 0%, ${comp1DarkHex} 100%)`,
      previewColors: [comp1LightHex, comp1DarkHex],
    },
    {
      id: "album-triadic",
      gradient: `linear-gradient(135deg, ${comp2LightHex} 0%, ${comp2DarkHex} 100%)`,
      previewColors: [comp2LightHex, comp2DarkHex],
    },
  ]
}
