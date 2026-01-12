/**
 * Centralized error definitions for API routes and shared logic
 *
 * Domain-specific errors should remain in their respective modules:
 * - BPM errors: src/lib/bpm/bpm-errors.ts
 * - Speech errors: src/lib/speech-errors.ts
 * - Service errors: remain co-located with their services
 */

import { Data } from "effect"

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Error during authentication process (session fetch failed, etc.)
 */
export class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

/**
 * User is not authenticated (no session or invalid session)
 */
export class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

/**
 * User is authenticated but lacks permission for this action
 */
export class ForbiddenError extends Data.TaggedClass("ForbiddenError")<object> {}

export type AuthErrors = AuthError | UnauthorizedError | ForbiddenError

// ============================================================================
// Request Validation Errors
// ============================================================================

/**
 * Request validation failed (missing fields, invalid format, etc.)
 */
export class ValidationError extends Data.TaggedClass("ValidationError")<{
  readonly message: string
}> {}

/**
 * Requested resource was not found
 */
export class NotFoundError extends Data.TaggedClass("NotFoundError")<{
  readonly resource: string
  readonly id?: string
}> {}

/**
 * Resource already exists (duplicate entry, etc.)
 */
export class ConflictError extends Data.TaggedClass("ConflictError")<{
  readonly message: string
}> {}

export type RequestErrors = ValidationError | NotFoundError | ConflictError

// ============================================================================
// Database Errors
// ============================================================================

/**
 * Database operation failed
 */
export class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly cause: unknown
}> {}

export type DataErrors = DatabaseError

// ============================================================================
// Network Errors
// ============================================================================

/**
 * Network request failed
 */
export class NetworkError extends Data.TaggedClass("NetworkError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export type NetworkErrors = NetworkError

// ============================================================================
// API Error Union
// ============================================================================

/**
 * All common API errors
 */
export type ApiError = AuthErrors | RequestErrors | DataErrors | NetworkErrors
