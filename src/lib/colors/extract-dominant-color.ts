const SAMPLE_SIZE = 32

export async function extractDominantColor(url: string): Promise<string | null> {
  if (typeof window === "undefined") return null

  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(null)
          return
        }

        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

        const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const data = imageData.data

        let totalR = 0
        let totalG = 0
        let totalB = 0
        let count = 0

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] ?? 0
          const g = data[i + 1] ?? 0
          const b = data[i + 2] ?? 0
          const a = data[i + 3] ?? 0

          if (a < 128) continue

          const brightness = (r + g + b) / 3
          if (brightness < 20 || brightness > 235) continue

          totalR += r
          totalG += g
          totalB += b
          count++
        }

        if (count === 0) {
          resolve(null)
          return
        }

        const avgR = Math.round(totalR / count)
        const avgG = Math.round(totalG / count)
        const avgB = Math.round(totalB / count)

        resolve(`rgb(${avgR},${avgG},${avgB})`)
      } catch {
        resolve(null)
      }
    }

    img.onerror = () => resolve(null)
    img.src = url
  })
}

function parseRgb(rgb: string): { r: number; g: number; b: number } | null {
  const match = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/)
  if (!match) return null
  return {
    r: Number.parseInt(match[1] ?? "0", 10),
    g: Number.parseInt(match[2] ?? "0", 10),
    b: Number.parseInt(match[3] ?? "0", 10),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`
}

function darken(
  r: number,
  g: number,
  b: number,
  factor: number,
): { r: number; g: number; b: number } {
  return {
    r: r * (1 - factor),
    g: g * (1 - factor),
    b: b * (1 - factor),
  }
}

function shiftHue(
  r: number,
  g: number,
  b: number,
  degrees: number,
): { r: number; g: number; b: number } {
  // Convert RGB to HSL
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    if (max === rNorm) {
      h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
    } else if (max === gNorm) {
      h = ((bNorm - rNorm) / d + 2) / 6
    } else {
      h = ((rNorm - gNorm) / d + 4) / 6
    }
  }

  // Shift hue
  h = (h + degrees / 360) % 1
  if (h < 0) h += 1

  // Convert back to RGB
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
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

export interface GradientOption {
  readonly id: string
  readonly gradient: string
  readonly previewColors: readonly [string, string]
}

export function buildGradientPalette(baseColor: string | null): GradientOption[] {
  const parsed = baseColor ? parseRgb(baseColor) : null

  if (!parsed) {
    // Default gradients when no album art color is available
    return [
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
        id: "slate-dark",
        gradient: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        previewColors: ["#1e293b", "#0f172a"],
      },
      {
        id: "neutral-dark",
        gradient: "linear-gradient(135deg, #27272a 0%, #18181b 100%)",
        previewColors: ["#27272a", "#18181b"],
      },
    ]
  }

  const { r, g, b } = parsed

  // Create variations based on the dominant color
  const darkened = darken(r, g, b, 0.4)
  const hueShifted = shiftHue(r, g, b, 30)
  const hueShiftedDark = darken(hueShifted.r, hueShifted.g, hueShifted.b, 0.3)

  const baseHex = rgbToHex(r, g, b)
  const darkHex = rgbToHex(darkened.r, darkened.g, darkened.b)
  const shiftedHex = rgbToHex(hueShifted.r, hueShifted.g, hueShifted.b)
  const shiftedDarkHex = rgbToHex(hueShiftedDark.r, hueShiftedDark.g, hueShiftedDark.b)

  return [
    {
      id: "album-primary",
      gradient: `linear-gradient(135deg, ${baseHex} 0%, ${darkHex} 100%)`,
      previewColors: [baseHex, darkHex],
    },
    {
      id: "album-shifted",
      gradient: `linear-gradient(135deg, ${baseHex} 0%, ${shiftedDarkHex} 100%)`,
      previewColors: [baseHex, shiftedDarkHex],
    },
    {
      id: "album-reverse",
      gradient: `linear-gradient(135deg, ${shiftedHex} 0%, ${darkHex} 100%)`,
      previewColors: [shiftedHex, darkHex],
    },
    {
      id: "indigo-purple",
      gradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
      previewColors: ["#4f46e5", "#7c3aed"],
    },
    {
      id: "slate-dark",
      gradient: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
      previewColors: ["#1e293b", "#0f172a"],
    },
    {
      id: "neutral-dark",
      gradient: "linear-gradient(135deg, #27272a 0%, #18181b 100%)",
      previewColors: ["#27272a", "#18181b"],
    },
  ]
}

// Keep the old buildPalette for backwards compatibility
export function buildPalette(baseColor: string | null): string[] {
  const gradients = buildGradientPalette(baseColor)
  return gradients.map(g => g.previewColors[0])
}
