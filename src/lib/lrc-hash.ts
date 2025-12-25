/**
 * LRC Hash Utility
 *
 * Computes a consistent hash of LRC content for cache invalidation.
 * Used to detect when base lyrics have changed and enhancements need re-alignment.
 */

/**
 * Canonicalize LRC content for consistent hashing:
 * - Normalize line endings to \n
 * - Trim trailing whitespace from each line
 * - Remove trailing empty lines
 */
export function canonicalizeLrc(lrc: string): string {
  return lrc
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .join("\n")
    .trimEnd()
}

/**
 * Compute SHA-256 hash of canonicalized LRC content.
 * Works in both browser and Node.js environments.
 */
export async function computeLrcHash(lrc: string): Promise<string> {
  const canonical = canonicalizeLrc(lrc)
  const encoder = new TextEncoder()
  const data = encoder.encode(canonical)

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  }

  // Fallback for environments without crypto.subtle (shouldn't happen in modern browsers/Node 20+)
  throw new Error("crypto.subtle not available")
}

/**
 * Synchronous hash computation using a simple string hash.
 * Use for non-critical paths where async isn't convenient.
 * NOT cryptographically secure - only for cache keys.
 */
export function computeLrcHashSync(lrc: string): string {
  const canonical = canonicalizeLrc(lrc)
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  // Convert to hex and pad to ensure consistent length
  return (hash >>> 0).toString(16).padStart(8, "0")
}
