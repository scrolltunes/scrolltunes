import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { loadServerConfig } from "@/services/server-config"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

const { authSecret } = loadServerConfig()

function getEncryptionKey(): Buffer {
  return Buffer.from(authSecret.slice(0, 32).padEnd(32, "0"))
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(ciphertext, "base64")

  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
