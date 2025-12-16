import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIndex = trimmed.indexOf("=")
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // File doesn't exist, skip
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"))
loadEnvFile(resolve(process.cwd(), ".env"))
