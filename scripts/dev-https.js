const fs = require("node:fs")
const path = require("node:path")
const https = require("node:https")
const httpProxy = require("http-proxy")
const os = require("node:os")
const { spawn } = require("node:child_process")

// Check if certificates exist
const certPath = path.join(process.cwd(), "cert.pem")
const keyPath = path.join(process.cwd(), "key.pem")

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error("❌ SSL certificates not found")
  console.error(
    "Run: mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 $(hostname -f)",
  )
  process.exit(1)
}

// Start Next.js dev server on HTTP
const nextPort = 3001
const httpsPort = 3000

console.log("Starting Next.js dev server on port", nextPort)
const devServer = spawn("bun", ["run", "dev"], {
  env: { ...process.env, PORT: nextPort },
  stdio: "inherit",
})

devServer.on("error", err => {
  console.error("Failed to start dev server:", err)
  process.exit(1)
})

// Wait a moment for dev server to start, then start HTTPS proxy
setTimeout(() => {
  const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${nextPort}`,
    ws: true,
  })

  proxy.on("error", (err, req, res) => {
    console.error("Proxy error:", err)
    if (res.headersSent) return
    res.writeHead(502, { "Content-Type": "text/plain" })
    res.end("Bad Gateway")
  })

  // Create HTTPS server
  const options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  }

  https
    .createServer(options, (req, res) => {
      proxy.web(req, res)
    })
    .listen(httpsPort, "0.0.0.0", () => {
      const localIP = Object.values(os.networkInterfaces())
        .flat()
        .find(addr => addr.family === "IPv4" && !addr.internal)?.address

      console.log(`
✅ HTTPS dev server running on port ${httpsPort}

  Local:        https://localhost:${httpsPort}
  Network:      https://${localIP || "0.0.0.0"}:${httpsPort}
  `)
    })

  // Forward WebSocket upgrades
  https.createServer(options).on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head)
  })
}, 3000)

// Handle exit
process.on("SIGINT", () => {
  devServer.kill()
  process.exit(0)
})
