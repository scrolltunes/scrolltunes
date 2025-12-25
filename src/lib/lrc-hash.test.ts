import { describe, expect, it } from "vitest"
import { canonicalizeLrc, computeLrcHash, computeLrcHashSync } from "./lrc-hash"

describe("canonicalizeLrc", () => {
  it("normalizes CRLF to LF", () => {
    const input = "[00:00.00]Hello\r\n[00:01.00]World"
    const result = canonicalizeLrc(input)
    expect(result).toBe("[00:00.00]Hello\n[00:01.00]World")
  })

  it("trims trailing whitespace from each line", () => {
    const input = "[00:00.00]Hello   \n[00:01.00]World  "
    const result = canonicalizeLrc(input)
    expect(result).toBe("[00:00.00]Hello\n[00:01.00]World")
  })

  it("removes trailing empty lines", () => {
    const input = "[00:00.00]Hello\n[00:01.00]World\n\n\n"
    const result = canonicalizeLrc(input)
    expect(result).toBe("[00:00.00]Hello\n[00:01.00]World")
  })
})

describe("computeLrcHash", () => {
  it("produces consistent hash for same content", async () => {
    const lrc = "[00:00.00]Hello\n[00:01.00]World"
    const hash1 = await computeLrcHash(lrc)
    const hash2 = await computeLrcHash(lrc)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex chars
  })

  it("produces same hash regardless of line endings", async () => {
    const lf = "[00:00.00]Hello\n[00:01.00]World"
    const crlf = "[00:00.00]Hello\r\n[00:01.00]World"
    expect(await computeLrcHash(lf)).toBe(await computeLrcHash(crlf))
  })

  it("produces same hash regardless of trailing whitespace", async () => {
    const clean = "[00:00.00]Hello\n[00:01.00]World"
    const withSpaces = "[00:00.00]Hello   \n[00:01.00]World  \n\n"
    expect(await computeLrcHash(clean)).toBe(await computeLrcHash(withSpaces))
  })

  it("produces different hash for different content", async () => {
    const lrc1 = "[00:00.00]Hello\n[00:01.00]World"
    const lrc2 = "[00:00.00]Hello\n[00:01.00]Universe"
    expect(await computeLrcHash(lrc1)).not.toBe(await computeLrcHash(lrc2))
  })
})

describe("computeLrcHashSync", () => {
  it("produces consistent hash for same content", () => {
    const lrc = "[00:00.00]Hello\n[00:01.00]World"
    const hash1 = computeLrcHashSync(lrc)
    const hash2 = computeLrcHashSync(lrc)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(8) // 32-bit int as hex = 8 chars
  })

  it("produces same hash regardless of line endings", () => {
    const lf = "[00:00.00]Hello\n[00:01.00]World"
    const crlf = "[00:00.00]Hello\r\n[00:01.00]World"
    expect(computeLrcHashSync(lf)).toBe(computeLrcHashSync(crlf))
  })
})
