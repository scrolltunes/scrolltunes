/**
 * Shared input length limits for UI and API validation
 */

export const INPUT_LIMITS = {
  /** Setlist name max length */
  SETLIST_NAME: 100,
  /** Setlist description max length */
  SETLIST_DESCRIPTION: 500,
  /** Search query max length */
  SEARCH_QUERY: 200,
  /** Bug report description max length */
  REPORT_DESCRIPTION: 1000,
  /** Email max length (RFC 5321) */
  EMAIL: 254,
} as const
