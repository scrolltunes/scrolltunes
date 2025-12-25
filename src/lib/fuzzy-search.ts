/**
 * Fuzzy search utility for song search
 *
 * Matches query strings against song title and artist with scoring.
 */

export interface FuzzyMatchResult<T> {
  readonly item: T
  readonly score: number
}

function normalizeText(text: string | undefined | null): string {
  if (!text) return ""
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function calculateSubstringScore(query: string, target: string): number {
  if (!query || !target) return 0

  const normalizedQuery = normalizeText(query)
  const normalizedTarget = normalizeText(target)

  if (!normalizedQuery || !normalizedTarget) return 0

  if (normalizedTarget === normalizedQuery) return 1

  if (normalizedTarget.includes(normalizedQuery)) {
    const lengthRatio = normalizedQuery.length / normalizedTarget.length
    return 0.7 + lengthRatio * 0.3
  }

  if (normalizedTarget.startsWith(normalizedQuery)) {
    return 0.9
  }

  return 0
}

function calculateWordBoundaryScore(query: string, target: string): number {
  const normalizedQuery = normalizeText(query)
  const normalizedTarget = normalizeText(target)

  if (!normalizedQuery || !normalizedTarget) return 0

  const queryWords = normalizedQuery.split(" ").filter(Boolean)
  const targetWords = normalizedTarget.split(" ").filter(Boolean)

  if (queryWords.length === 0 || targetWords.length === 0) return 0

  let matchedWords = 0
  let prefixMatches = 0

  for (const qWord of queryWords) {
    for (const tWord of targetWords) {
      if (tWord === qWord) {
        matchedWords++
        break
      }
      if (tWord.startsWith(qWord)) {
        prefixMatches++
        break
      }
    }
  }

  const fullMatchScore = matchedWords / queryWords.length
  const prefixMatchScore = (prefixMatches / queryWords.length) * 0.7

  return Math.min(1, fullMatchScore + prefixMatchScore)
}

function scoreMatch(query: string, target: string): number {
  const substringScore = calculateSubstringScore(query, target)
  const wordBoundaryScore = calculateWordBoundaryScore(query, target)

  return Math.max(substringScore, wordBoundaryScore)
}

export function fuzzyMatchSongs<T extends { title: string; artist: string }>(
  query: string,
  items: readonly T[],
  threshold = 0.3,
): FuzzyMatchResult<T>[] {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) return []

  const results: FuzzyMatchResult<T>[] = []

  for (const item of items) {
    const titleScore = scoreMatch(normalizedQuery, item.title)
    const artistScore = scoreMatch(normalizedQuery, item.artist)
    const combinedTarget = `${item.artist} - ${item.title}`
    const combinedScore = scoreMatch(normalizedQuery, combinedTarget)

    const score = Math.max(titleScore, artistScore, combinedScore)

    if (score >= threshold) {
      results.push({ item, score })
    }
  }

  results.sort((a, b) => b.score - a.score)

  return results
}
