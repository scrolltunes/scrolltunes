import crypto from "node:crypto"
import { auth } from "@/auth"
import { NextResponse } from "next/server"

/**
 * STT Session Token Format (HMAC-signed)
 *
 * Token structure: <base64url(payload_json)>.<base64url(hmac_sha256(payload))>
 *
 * Payload fields:
 * - exp: Unix ms timestamp expiration
 * - userId: Internal user ID
 * - nonce: Random UUID per token (replay protection)
 *
 * TTL: 60 seconds (connect window)
 * Session max: 30 seconds (enforced server-side on WS bridge)
 */

const TOKEN_TTL_MS = 60_000

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8")
  return buf.toString("base64url")
}

function sign(payloadB64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url")
}

interface TokenResponse {
  token: string
  expiresAt: number
}

interface ErrorResponse {
  error: string
}

export async function GET(): Promise<NextResponse<TokenResponse | ErrorResponse>> {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const secret = process.env.WS_SESSION_SECRET
  if (!secret) {
    console.error("[STT-TOKEN] WS_SESSION_SECRET not configured")
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
  }

  const exp = Date.now() + TOKEN_TTL_MS

  const payload = {
    exp,
    userId: session.user.id,
    nonce: crypto.randomUUID(),
  }

  const payloadB64 = base64url(JSON.stringify(payload))
  const sigB64 = sign(payloadB64, secret)
  const token = `${payloadB64}.${sigB64}`

  return NextResponse.json({
    token,
    expiresAt: exp,
  })
}
