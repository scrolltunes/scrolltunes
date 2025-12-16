import path from "node:path"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      env,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
