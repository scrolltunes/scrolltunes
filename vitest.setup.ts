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
      let value = trimmed.slice(eqIndex + 1)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
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

const defaultEnv: Record<string, string> = {
  POSTGRES_URL: "postgres://test-user:test-pass@localhost:5432/test",
  AUTH_SECRET: "test-auth-secret-32-bytes-minimum",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  SPOTIFY_CLIENT_ID: "test-spotify-client-id",
  SPOTIFY_CLIENT_SECRET: "test-spotify-client-secret",
  GOOGLE_CLOUD_PROJECT_ID: "test-gcp-project",
  GOOGLE_CLOUD_CLIENT_EMAIL: "test-gcp@example.com",
  GOOGLE_CLOUD_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----",
  GETSONGBPM_API_KEY: "test-getsongbpm-key",
  RAPIDAPI_KEY: "test-rapidapi-key",
  KV_REST_API_URL: "https://test-kv.example.com",
  KV_REST_API_TOKEN: "test-kv-token",
  NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY: "test-web3forms-key",
}

for (const [key, value] of Object.entries(defaultEnv)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}
