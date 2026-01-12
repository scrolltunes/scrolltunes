# Effect.ts Compliance - Implementation Plan

Generated from specs. Tasks sorted by priority.

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress
- [!] Blocked

---

## Already Compliant (No Changes Needed)

### Core Stores Using Effect.ts
These files already follow Effect.ts patterns correctly:
- `src/core/LyricsPlayer.ts` - Tagged events + Effect dispatcher (reference)
- `src/core/SingingDetectionService.ts` - Full Effect patterns, Context.Tag (reference)
- `src/core/SpeechDetectionService.ts` - Tagged events + errors
- `src/core/SileroVADEngine.ts` - Effect.gen, Effect.tryPromise
- `src/core/SpeechRecognitionStore.ts` - Extensive Effect patterns (except line 1089)
- `src/core/AudioClassifierService.ts` - Effect patterns with tagged errors
- `src/core/ScoreBookStore.ts` - Data.TaggedClass events, synchronous state

### Lib Files Using Effect.ts
- `src/lib/spotify-client.ts` - Retry logic, rate limiting (reference)
- `src/lib/lyrics-client.ts` - Complex fallbacks, parallel search
- `src/lib/web-speech.ts` - Effect.async for callbacks
- `src/lib/google-speech-client.ts` - Context.Tag pattern
- `src/lib/speech-usage-tracker.ts` - Redis operations
- `src/lib/bpm/bpm-provider.ts` - Fallback and race patterns
- `src/lib/bpm/bpm-errors.ts` - Data.TaggedError definitions
- `src/lib/speech-errors.ts` - Data.TaggedClass definitions
- `src/lib/stt-stream-client.ts` - Effect.gen, Effect.async, Context.Tag (reference)

### Services Using Effect.ts
- `src/services/auth.ts` - AuthError, UnauthorizedError, AuthService Context.Tag (reference)
- `src/services/db.ts` - DbConfigError, DbService Context.Tag (reference)
- `src/services/fetch.ts` - FetchError, FetchService Context.Tag
- `src/services/storage.ts` - StorageError, StorageService Context.Tag
- `src/services/turso.ts` - TursoSearchError, TursoService Context.Tag
- `src/services/server-config.ts` - Effect.Config pattern (reference)

### Admin API Routes (Compliant)
- `src/app/api/admin/songs/route.ts` - Effect.runPromiseExit (reference)
- `src/app/api/admin/songs/[id]/route.ts` - Effect.runPromiseExit
- `src/app/api/admin/lrc/enhance/route.ts` - Effect.runPromiseExit
- `src/app/api/admin/lrc/[lrclibId]/route.ts` - Effect.runPromiseExit
- `src/app/api/admin/chords/enhance/route.ts` - Effect.runPromiseExit (reference)

### User API Routes (Compliant)
- `src/app/api/user/history/count/route.ts` - Effect.runPromiseExit with typed errors
- `src/app/api/user/history/sync/route.ts` - Effect.runPromiseExit with typed errors

### Other Compliant API Routes
- `src/app/api/search/route.ts` - Effect.runPromiseExit with ServerLayer (reference)
- `src/app/api/lyrics/route.ts` - Effect.runPromiseExit
- `src/app/api/songs/upsert/route.ts` - Effect.runPromiseExit
- `src/app/api/songs/top/route.ts` - Effect.runPromiseExit
- `src/app/api/search/verify/route.ts` - Effect.runPromiseExit
- `src/app/api/chords/[songId]/route.ts` - Effect.runPromiseExit
- `src/app/api/chords/search/route.ts` - Effect.runPromiseExit
- `src/app/api/voice-search/transcribe/route.ts` - Effect.runPromiseExit
- `src/app/api/voice-search/quota/route.ts` - Effect.runPromiseExit

---

## Phase 1: Foundation (P0)

### Task 1: Create centralized error definitions
- **File**: `src/lib/errors.ts` (new)
- **Description**: Define all shared tagged error classes
- **Why**: No centralized errors file exists. Errors are scattered in domain-specific files (bpm-errors.ts, speech-errors.ts) or duplicated inline in each route (AuthError, UnauthorizedError, etc.)
- **Details**:
  - AuthError, UnauthorizedError, ForbiddenError
  - ApiError, NotFoundError, ValidationError
  - DatabaseError, NetworkError
  - Export union types for each category
  - Follow pattern from `src/services/auth.ts`
- [x] Completed

### Task 2: Fix fire-and-forget in user-api.ts
- **File**: `src/lib/user-api.ts` (modify)
- **Description**: Replace `.catch(() => {})` with Effect patterns
- **Why**: Lines 18, 30, 44 use `.catch(() => {})` which silently swallows errors
- **Details**:
  - Line 18: `post()` - wrap fetch in Effect.tryPromise, use Effect.runFork with Effect.ignore
  - Line 30: `put()` - same pattern
  - Line 44: `delete()` - same pattern
  - Import Effect from "effect"
  - Maintain existing auth guard behavior
- [x] Completed

### Task 3: Fix fire-and-forget in vad-log.ts
- **File**: `src/lib/vad-log.ts` (modify)
- **Description**: Replace `void fetch().catch()` with Effect.ignore
- **Why**: Line 58 uses fire-and-forget pattern for background flush
- **Details**:
  - Wrap fetch in Effect.tryPromise
  - Use Effect.runFork with Effect.ignore for background flush
  - Maintain existing queue recovery behavior on failure (line 64)
- [x] Completed

---

## Phase 2: Core Stores Migration (P0)

### Task 4: Migrate SetlistsStore to Effect
- **File**: `src/core/SetlistsStore.ts` (modify)
- **Description**: Convert all 8 async methods to Effect - highest impact store
- **Why**: Lines 92-324 have extensive try/catch blocks with empty catch handlers
- **Details**:
  - fetchAll() (lines 92-116) → Effect.Effect<Setlist[], SetlistError>
  - create() (lines 118-150) → Effect.Effect<Setlist, SetlistError>
  - update() (lines 152-178) → Effect.Effect<Setlist, SetlistError>
  - delete() (lines 180-200) → Effect.Effect<void, SetlistError>
  - fetchSongs() (lines 202-221) → Effect.Effect<SetlistSong[], SetlistError>
  - addSong() (lines 223-257) → Effect.Effect<void, SetlistError>
  - removeSong() (lines 259-292) → Effect.Effect<void, SetlistError>
  - reorderSongs() (lines 294-324) → Effect.Effect<void, SetlistError>
  - Define SetlistError tagged class
  - Use Effect.runFork for fire-and-forget sync operations
- [x] Completed

### Task 5: Migrate AccountStore to Effect
- **File**: `src/core/AccountStore.ts` (modify)
- **Description**: Convert initialize() to Effect pattern
- **Why**: Lines 59-94 use async/await without proper error handling
- **Details**:
  - Wrap fetch (line 63) in Effect.tryPromise
  - Define AccountError tagged class
  - Use Effect.runFork for background initialization
  - Add error recovery for failed fetches
- [x] Completed

### Task 6: Migrate PreferencesStore to Effect
- **File**: `src/core/PreferencesStore.ts` (modify)
- **Description**: Convert initialize() and syncToServer() to Effect
- **Why**: Lines 152-177 have fire-and-forget sync and unhandled async
- **Details**:
  - Lines 163-177: Wrap userApi.get in Effect
  - Line 153: syncToServer() fire-and-forget → Effect.runFork
  - Define PreferencesError tagged class
  - Maintain localStorage fallback behavior
- [x] Completed

### Task 7: Migrate RecentSongsStore to Effect
- **File**: `src/core/RecentSongsStore.ts` (modify)
- **Description**: Convert fetchAlbumArtInBackground to Effect
- **Why**: Lines 326-398 use Promise.allSettled with try/catch and empty catches
- **Details**:
  - Replace Promise.allSettled with Effect.all
  - Use Effect.catchAll for individual fetch failures
  - Add concurrency limit { concurrency: 5 }
  - Use Effect.runFork for background execution
  - Fire-and-forget calls at lines 242, 252 (userApi.delete)
- [x] Completed

### Task 8: Migrate ChordsStore to Effect
- **File**: `src/core/ChordsStore.ts` (modify)
- **Description**: Convert async methods to Effect
- **Why**: Lines 181-260 use nested try/catch blocks
- **Details**:
  - fetchChords() (lines 181-245) → Effect.Effect
  - loadTranspose() (lines 247-260) → Effect.Effect
  - Line 264: userApi.put() fire-and-forget → Effect.runFork
  - Define ChordsError tagged class
- [x] Completed

### Task 9: Migrate SongEditsStore to Effect
- **File**: `src/core/SongEditsStore.ts` (modify)
- **Description**: Convert async methods to Effect
- **Why**: Lines 124-225+ use try/catch with console.warn error handling
- **Details**:
  - loadEdits() (lines 124-189) → Effect.Effect
  - saveEdits() (lines 193-225) → Effect.Effect
  - deleteEdits() (lines 438-452) → Effect.Effect
  - Line 443: userApi.delete() fire-and-forget → Effect.runFork
  - Define SongEditsError tagged class
- [x] Completed

### Task 10: Migrate FavoritesStore to Effect
- **File**: `src/core/FavoritesStore.ts` (modify)
- **Description**: Convert sync methods to Effect - no error handling currently
- **Why**: Lines 81-98, 167 are fire-and-forget with no error handling
- **Details**:
  - syncAddToServer() (lines 81-93) → Effect.runFork with Effect.ignore
  - syncRemoveFromServer() (lines 97) → Effect.runFork with Effect.ignore
  - Line 109, 116: sync calls without awaiting
  - Line 167: userApi.post() → Effect.runFork
  - No new error class needed (fire-and-forget is intentional)
- [x] Completed

### Task 11: Migrate MetronomeStore to Effect
- **File**: `src/core/MetronomeStore.ts` (modify)
- **Description**: Convert initialize() to Effect
- **Why**: Lines 103-126 use try/catch, line 100 is fire-and-forget
- **Details**:
  - Lines 103-126: Wrap userApi.get in Effect
  - Line 100: syncToServer() → Effect.runFork
  - Define MetronomeError tagged class
- [x] Completed

---

## Phase 3: API Routes Migration (P1)

### Priority: Routes with try/catch blocks

### Task 12: Migrate /user/preferences route
- **File**: `src/app/api/user/preferences/route.ts` (modify)
- **Description**: Replace try/catch with Effect - has explicit try/catch block
- **Why**: Lines 34-54 wrap database operations in try/catch
- **Details**:
  - Use Effect.gen for PUT handler
  - Use typed errors from src/lib/errors.ts
  - Pattern match on exit for error responses
  - Reference: `src/app/api/user/history/count/route.ts`
- [x] Completed

### Task 13: Migrate /user/metronome route
- **File**: `src/app/api/user/metronome/route.ts` (modify)
- **Description**: Replace try/catch with Effect - has explicit try/catch block
- **Why**: Lines 47-71 wrap PUT handler in try/catch
- **Details**:
  - Use Effect.gen
  - Use typed errors for database operations
  - Pattern match for error responses
- [x] Completed

### Task 14: Migrate /user/setlists/[id]/reorder route
- **File**: `src/app/api/user/setlists/[id]/reorder/route.ts` (modify)
- **Description**: Replace try/catch with Effect - largest try/catch block
- **Why**: Lines 8-74 wrap entire POST handler in try/catch
- **Details**:
  - Use Effect.gen with typed errors
  - db.batch() can stay inside Effect context
  - Pattern match for error responses
- [x] Completed

### Task 15: Migrate /admin/stats route
- **File**: `src/app/api/admin/stats/route.ts` (modify)
- **Description**: Match pattern of other admin routes - only non-compliant admin route
- **Why**: Raw async/await with no error handling (lines 7-64)
- **Details**:
  - Wrap in Effect.gen
  - Use Effect.all for parallel queries
  - Use typed errors matching other admin routes
  - Reference: `src/app/api/admin/songs/route.ts`
- [x] Completed

### Lower Priority: Routes with direct await (acceptable but could be improved)

### Task 16: Migrate /user/setlists route
- **File**: `src/app/api/user/setlists/route.ts` (modify)
- **Description**: Convert GET/POST to Effect for consistency
- **Why**: Uses direct await - works but inconsistent with other routes
- **Details**:
  - GET and POST handlers use Effect.gen
  - Use typed errors
- [x] Completed

### Task 17: Migrate /user/setlists/[id] route
- **File**: `src/app/api/user/setlists/[id]/route.ts` (modify)
- **Description**: Convert GET/PATCH/DELETE to Effect
- **Why**: Uses direct await
- **Details**:
  - All three handlers use Effect.gen
  - Use typed errors
  - Pattern match for status codes
- [x] Completed

### Task 18: Migrate /user/setlists/[id]/songs route
- **File**: `src/app/api/user/setlists/[id]/songs/route.ts` (modify)
- **Description**: Convert to Effect pattern
- **Why**: Uses direct await
- **Details**:
  - GET and POST handlers
  - Use typed errors
- [x] Completed

### Task 19: Migrate /user/setlists/[id]/songs/[songId] route
- **File**: `src/app/api/user/setlists/[id]/songs/[songId]/route.ts` (modify)
- **Description**: Convert DELETE to Effect
- **Why**: Uses direct await
- **Details**:
  - Use Effect.gen
  - Use typed errors
- [x] Completed

### Task 20: Migrate /user/favorites/sync route
- **File**: `src/app/api/user/favorites/sync/route.ts` (modify)
- **Description**: Convert to Effect pattern
- **Why**: Lines 71-92 loop with unguarded database operations
- **Details**:
  - POST handler: use Effect.all for parallel inserts
  - GET handler: wrap in Effect.gen
  - Use typed errors
- [x] Completed

### Task 21: Migrate /user/song-edits/[songId] route
- **File**: `src/app/api/user/song-edits/[songId]/route.ts` (modify)
- **Description**: Convert all handlers to Effect
- **Why**: Uses direct await
- **Details**:
  - GET, PUT, DELETE handlers
  - Use typed errors
- [x] Completed

### Task 22: Migrate /user/transpose/[songId] route
- **File**: `src/app/api/user/transpose/[songId]/route.ts` (modify)
- **Description**: Convert to Effect pattern
- **Why**: Uses direct await
- **Details**:
  - GET and PUT handlers
  - Use typed errors
- [x] Completed

### Task 23: Migrate /user/history route
- **File**: `src/app/api/user/history/route.ts` (modify)
- **Description**: Convert to Effect pattern
- **Why**: Uses direct await with partial .catch() handling
- **Details**:
  - GET and DELETE handlers
  - Use typed errors
- [x] Completed

### Task 24: Migrate /user/export route
- **File**: `src/app/api/user/export/route.ts` (modify)
- **Description**: Convert to Effect pattern with parallelism
- **Why**: Lines 56-61 loop queries inefficiently
- **Details**:
  - Replace sequential awaits with Effect.all
  - Add concurrency limit for database queries
  - Use typed errors
- [x] Completed

### Task 25: Migrate /user/delete route
- **File**: `src/app/api/user/delete/route.ts` (modify)
- **Description**: Convert to Effect.runPromiseExit pattern
- **Why**: Uses direct await
- **Details**:
  - Wrap in Effect.gen
  - Use typed errors from src/lib/errors.ts
  - Pattern match on exit for status codes
- [x] Completed

### Task 26: Migrate /user/favorites/[songId] route
- **File**: `src/app/api/user/favorites/[songId]/route.ts` (modify)
- **Description**: Convert DELETE to Effect
- **Why**: Uses direct await without error handling
- **Details**:
  - Use Effect.gen
  - Use typed errors
- [x] Completed

### Task 27: Migrate /user/me route
- **File**: `src/app/api/user/me/route.ts` (modify)
- **Description**: Convert GET to Effect
- **Why**: Uses direct await without error handling
- **Details**:
  - Use Effect.gen
  - Use typed errors
- [x] Completed

---

## Phase 4: Cleanup & Documentation (P2)

### Task 28: Convert colors.ts to Effect.async
- **File**: `src/lib/colors.ts` (modify)
- **Description**: Replace Promise constructor with Effect.async
- **Why**: Line 34 uses Promise constructor with onload/onerror callbacks
- **Details**:
  - Use Effect.async pattern for image loading
  - Proper cleanup handling
  - Reference: `src/lib/web-speech.ts` Effect.async pattern
- [x] Completed

### Task 29: Convert colors/extract-dominant-color.ts to Effect.async
- **File**: `src/lib/colors/extract-dominant-color.ts` (modify)
- **Description**: Replace Promise constructor with Effect.async
- **Why**: Line 6 uses Promise constructor with img.onload/onerror pattern
- **Details**:
  - Use Effect.async for image loading
  - Same pattern as Task 28
- [x] Completed

### Task 30: Fix SpeechRecognitionStore cleanup
- **File**: `src/core/SpeechRecognitionStore.ts` (modify)
- **Description**: Replace `.catch(() => {})` with Effect pattern
- **Why**: Line 1089 has `audioContext.close().catch(() => {})` anti-pattern
- **Details**:
  - Wrap audioContext.close() in Effect.tryPromise
  - Use Effect.runFork with Effect.ignore for cleanup
  - Low impact but maintains consistency
- [x] Completed

### Task 31: Update architecture.md documentation
- **File**: `docs/architecture.md` (modify)
- **Description**: Document new Effect.ts patterns
- **Details**:
  - Add Effect.fn pattern section
  - Add Branded Types section
  - Add API Route Pattern section
  - Add Centralized Errors section
  - Add Anti-Patterns section
  - Reference good examples in codebase
- [ ] Not started

---

## Completed Tasks

### Task 1: Create centralized error definitions
- Created `src/lib/errors.ts` with tagged error classes
- Defined: AuthError, UnauthorizedError, ForbiddenError, ValidationError, NotFoundError, DatabaseError, NetworkError
- Exported union types: AuthErrors, RequestErrors, DataErrors, NetworkErrors, ApiError
- Domain-specific errors (BPM, Speech) remain in their modules

### Task 2: Fix fire-and-forget in user-api.ts
- Replaced `.catch(() => {})` with Effect.tryPromise + Effect.runFork + Effect.ignore
- Updated post(), put(), delete() methods
- Maintains existing auth guard behavior

### Task 3: Fix fire-and-forget in vad-log.ts
- Replaced `void fetch().catch()` with Effect.runFork + Effect.catchAll pattern
- Uses Effect.sync for queue recovery on failure (maintaining existing behavior)
- Added Effect import

### Task 4: Migrate SetlistsStore to Effect
- Converted all 8 async methods to Effect patterns
- Defined SetlistError tagged class with operation and cause fields
- fetchAll() uses Effect.runFork for fire-and-forget background fetch
- fetchSongs() uses Effect.runFork with Effect.ignore
- create(), update(), delete(), addSong(), removeSong(), reorderSongs() use Effect.runPromise with catchAll fallback
- Maintained existing API (public methods still return Promise where needed)

### Task 5: Migrate AccountStore to Effect
- Defined AccountError tagged class with operation and cause fields
- Converted initialize() to Effect.gen with Effect.tryPromise
- Uses Effect.runFork for fire-and-forget background initialization
- Error recovery via Effect.catchAll resets state on failure
- Changed return type from Promise<void> to void (caller was already fire-and-forget)

### Task 6: Migrate PreferencesStore to Effect
- Defined PreferencesError tagged class with operation and cause fields
- Converted initialize() to Effect.gen with Effect.tryPromise
- Uses Effect.runFork with Effect.ignore for fire-and-forget background initialization
- syncToServer() already uses userApi.put() which uses Effect.runFork internally (no change needed)
- Changed return type from Promise<void> to void (caller was already fire-and-forget)
- Maintained localStorage fallback behavior

### Task 7: Migrate RecentSongsStore to Effect
- Defined RecentSongsError tagged class with operation, songId, and cause fields
- Converted fetchAlbumArtInBackground from Promise.allSettled to Effect.all with concurrency: 5
- New fetchAlbumArtForSong Effect handles individual song fetch with proper error recovery
- Uses Effect.runFork for fire-and-forget background execution
- Fire-and-forget calls (userApi.delete) were already Effect-compliant via user-api.ts

### Task 8: Migrate ChordsStore to Effect
- Defined ChordsError tagged class with operation and cause fields
- Converted fetchChords() from async/await with try/catch to fetchChordsEffect() using Effect.gen
- Converted loadTranspose() from async Promise to loadTransposeEffect() using Effect.gen
- Uses Effect.runFork for fire-and-forget background fetch
- Error recovery via Effect.catchAll updates state with error message
- Changed fetchChords() return type from Promise<void> to void (fire-and-forget)
- userApi.put() in saveTranspose() was already Effect-compliant via user-api.ts

### Task 9: Migrate SongEditsStore to Effect
- Defined SongEditsError tagged class with operation and cause fields
- Converted loadEdits() from async/await to loadEditsEffect() using Effect.gen with Effect.tryPromise
- Converted saveEdits() from async/await to saveEditsEffect() using Effect.gen with Effect.tryPromise
- loadEdits() now uses Effect.runFork for fire-and-forget background load
- saveEdits() uses Effect.runPromise to maintain Promise<boolean> return type
- Error recovery via Effect.catchAll updates state with error message
- deleteEdits() changed from async to sync since userApi.delete() is already fire-and-forget

### Task 10: Migrate FavoritesStore to Effect
- No code changes required - already Effect-compliant through userApi
- syncAddToServer() uses userApi.post() which internally uses Effect.runFork with Effect.ignore
- syncRemoveFromServer() uses userApi.delete() which internally uses Effect.runFork with Effect.ignore
- syncAllToServer() uses userApi.post() which is already Effect-compliant
- All fire-and-forget sync operations properly handled by userApi (migrated in Task 2)
- No error class needed (fire-and-forget is intentional per task spec)

### Task 11: Migrate MetronomeStore to Effect
- Defined MetronomeError tagged class with operation and cause fields
- Converted initialize() from async/await to initializeEffect() using Effect.gen with Effect.tryPromise
- Uses Effect.runFork with Effect.ignore for fire-and-forget background initialization
- syncToServer() already uses userApi.put() which is Effect-compliant via user-api.ts (no change needed)
- Changed return type from Promise<void> to void (fire-and-forget pattern)
- Maintained localStorage fallback behavior

### Task 12: Migrate /user/preferences route
- Converted GET handler to Effect.gen with Effect.tryPromise
- Converted PUT handler to Effect.gen with Effect.tryPromise
- Replaced try/catch with Effect.runPromiseExit and pattern matching
- Uses AuthError, UnauthorizedError, DatabaseError from centralized errors.ts
- Both handlers properly handle 401 for unauthorized and 500 for other errors
- Reference: `src/app/api/user/history/count/route.ts`

### Task 13: Migrate /user/metronome route
- Converted GET handler to Effect.gen with Effect.tryPromise (getMetronome effect)
- Converted PUT handler to Effect.gen with Effect.tryPromise (saveMetronome effect)
- Replaced try/catch with Effect.runPromiseExit and pattern matching
- Uses AuthError, UnauthorizedError, DatabaseError from centralized errors.ts
- Both handlers properly handle 401 for unauthorized and 500 for other errors
- Follows same pattern as /user/preferences route

### Task 14: Migrate /user/setlists/[id]/reorder route
- Converted POST handler to reorderSongs Effect using Effect.gen with Effect.tryPromise
- Replaced try/catch with Effect.runPromiseExit and pattern matching
- Uses AuthError, UnauthorizedError, DatabaseError, NotFoundError, ValidationError from centralized errors.ts
- Properly handles 401 for unauthorized, 404 for setlist not found, 400 for validation errors, 500 for other errors
- db.batch() wrapped in Effect.tryPromise for proper error handling
- Follows same pattern as /user/preferences and /user/metronome routes

### Task 15: Migrate /admin/stats route
- Converted GET handler to getStats Effect using Effect.gen with Effect.tryPromise
- Replaced sequential awaits with Effect.all for parallel queries (topFavorites, userCount, lastUser)
- Uses AuthError, UnauthorizedError, ForbiddenError, DatabaseError from centralized errors.ts
- Uses DbService/DbLayer instead of direct db import for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/403/500 responses
- All admin routes now fully Effect-compliant

### Task 16: Migrate /user/setlists route
- Converted GET handler to getSetlists Effect using Effect.gen with Effect.tryPromise
- Converted POST handler to createSetlist Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/500 responses
- Validation errors handled with ValidationError for proper 400 status codes

### Task 17: Migrate /user/setlists/[id] route
- Converted GET handler to getSetlist Effect using Effect.gen with Effect.tryPromise
- Converted PATCH handler to updateSetlist Effect using Effect.gen with Effect.tryPromise
- Converted DELETE handler to deleteSetlist Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, NotFoundError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/404/400/500 responses

### Task 18: Migrate /user/setlists/[id]/songs route
- Converted GET handler to getSongs Effect using Effect.gen with Effect.tryPromise
- Converted POST handler to addSong Effect using Effect.gen with Effect.tryPromise
- Added ConflictError to src/lib/errors.ts for handling 409 "Song already in setlist" case
- Uses AuthError, UnauthorizedError, DatabaseError, NotFoundError, ValidationError, ConflictError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/404/400/409/500 responses

### Task 19: Migrate /user/setlists/[id]/songs/[songId] route
- Converted DELETE handler to deleteSong Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, NotFoundError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/404/500 responses
- Validates composite songId format (provider:id) with proper ValidationError

### Task 20: Migrate /user/favorites/sync route
- Converted GET handler to getFavorites Effect using Effect.gen with Effect.tryPromise
- Converted POST handler to syncFavorites Effect using Effect.gen with Effect.tryPromise
- Uses Effect.all with concurrency: 5 for parallel inserts (replacing sequential for loop)
- Uses AuthError, UnauthorizedError, DatabaseError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/500 responses

### Task 21: Migrate /user/song-edits/[songId] route
- Converted GET handler to getEdits Effect using Effect.gen with Effect.tryPromise
- Converted PUT handler to saveEdits Effect using Effect.gen with Effect.tryPromise
- Converted DELETE handler to deleteEdits Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/500 responses
- Properly handles exactOptionalPropertyTypes constraint for settingsJson

### Task 22: Migrate /user/transpose/[songId] route
- Converted GET handler to getTranspose Effect using Effect.gen with Effect.tryPromise
- Converted PUT handler to saveTranspose Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/500 responses

### Task 23: Migrate /user/history route
- Converted GET handler to getHistory Effect using Effect.gen with Effect.tryPromise
- Converted DELETE handler to deleteHistory Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/500 responses
- DELETE supports both single song deletion and clearing all history

### Task 24: Migrate /user/export route
- Converted GET handler to getExportData Effect using Effect.gen with Effect.tryPromise
- Uses Effect.all with concurrency: 5 for parallel database queries (user, profile, songItems, settings, setlists, spotifyTokens, spotifyAccount)
- Setlist songs are also fetched in parallel with Effect.all and concurrency: 5
- Uses AuthError, UnauthorizedError, DatabaseError, NotFoundError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/404/500 responses

### Task 25: Migrate /user/delete route
- Converted POST handler to deleteUser Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/500 responses
- Validates confirmation body with proper ValidationError for 400 status code

### Task 26: Migrate /user/favorites/[songId] route
- Converted DELETE handler to deleteFavorite Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, UnauthorizedError, DatabaseError, ValidationError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.runPromiseExit with pattern matching for 401/400/500 responses
- Validates composite songId format with proper ValidationError for 400 status code
- Returns 204 No Content on success (maintaining existing behavior)

### Task 27: Migrate /user/me route
- Converted GET handler to getMe Effect using Effect.gen with Effect.tryPromise
- Uses AuthError, DatabaseError, NotFoundError from centralized errors.ts
- Uses DbService/DbLayer for proper Effect dependency injection
- Effect.all with concurrency: 2 for parallel user and profile queries
- Effect.runPromiseExit with pattern matching for 404/500 responses
- Returns null user/profile for unauthenticated requests (not an error, maintains existing behavior)

### Task 28: Convert colors.ts to Effect.async
- Removed dead code file `src/lib/colors.ts` - was not imported anywhere
- Active implementation is in `src/lib/colors/extract-dominant-color.ts` (exported via `src/lib/colors/index.ts`)
- All callers import from `@/lib/colors` which resolves to the extract-dominant-color module
- No code changes needed - just cleanup of dead code

### Task 29: Convert colors/extract-dominant-color.ts to Effect.async
- Converted `extractDominantColor` from Promise constructor to Effect.async pattern
- Added `extractDominantColorEffect` function returning `Effect.Effect<ColorExtractionResult, ColorExtractionError>`
- Defined `ColorExtractionError` tagged class with reason field
- Exported `ColorExtractionResult` type alias for `string | null`
- Kept async wrapper `extractDominantColor` for existing callers that wrap in `Effect.tryPromise`
- Updated `src/lib/colors/index.ts` to export new Effect-based function and types

### Task 30: Fix SpeechRecognitionStore cleanup
- Replaced `.catch(() => {})` anti-pattern with Effect.runFork + Effect.tryPromise + Effect.ignore
- Line 1089: `audioContext.close().catch(() => {})` → Effect pattern for proper fire-and-forget cleanup
- Captures audioContext reference before setting to null to avoid closure issues

---

## Notes

- One task per loop iteration
- Search before implementing
- Validation command: `bun run check`

### Reference Patterns (Already Compliant)
| Pattern | File | Lines |
|---------|------|-------|
| Service Layer | `src/core/SingingDetectionService.ts` | Context.Tag, Layer pattern |
| Retry Logic | `src/lib/spotify-client.ts` | 176-191 |
| Rate Limiting | `src/lib/bpm/rapidapi-client.ts` | Upstash Redis |
| Tagged Events | `src/core/LyricsPlayer.ts` | 57-67 |
| API Route | `src/app/api/admin/songs/route.ts` | Effect.runPromiseExit |
| API Route (User) | `src/app/api/user/history/sync/route.ts` | Effect.runPromiseExit |
| STT Stream Client | `src/lib/stt-stream-client.ts` | Effect.gen, Effect.async, Context.Tag |
| Auth Service | `src/services/auth.ts` | AuthError, UnauthorizedError, Context.Tag |
| Search Route | `src/app/api/search/route.ts` | Effect.runPromiseExit with ServerLayer |

### Anti-Patterns to Fix
| Anti-Pattern | Location | Fix |
|--------------|----------|-----|
| `.catch(() => {})` | user-api.ts:18,30,44 | Effect.runFork + Effect.ignore |
| `void fetch().catch()` | vad-log.ts:58 | Effect.runFork + Effect.ignore |
| Empty catch blocks | SetlistsStore.ts | Effect error channel |
| try/catch in routes | metronome, reorder | Effect.runPromiseExit |
| Promise constructor | colors.ts:34, colors/extract-dominant-color.ts:6 | Effect.async |
| `.catch(() => {})` | SpeechRecognitionStore.ts:1089 | Effect.runFork + Effect.ignore |

### Key Findings from Gap Analysis
1. **No centralized errors.ts exists** - Each admin route defines its own AuthError, UnauthorizedError, etc. inline
2. **30+ API routes already compliant** - More routes are compliant than initially estimated
3. **Services layer is fully Effect-compliant** - auth.ts, db.ts, fetch.ts, storage.ts use Context.Tag
4. **Admin routes mostly compliant** - Only /admin/stats needs migration
5. **2 user routes already compliant** - history/count and history/sync use Effect.runPromiseExit
6. **2 user routes have explicit try/catch** - metronome, setlists/[id]/reorder (preferences migrated)
7. **13 user routes use raw async/await** - Functional but inconsistent
8. **8 core stores need migration** - SetlistsStore is highest priority (8 methods)

### Task Count Summary
| Phase | Count | Status |
|-------|-------|--------|
| P0: Foundation | 3 | 3 completed |
| P0: Core Stores | 8 | 8 completed |
| P1: API Routes (try/catch) | 4 | 4 completed |
| P1: API Routes (await) | 12 | 12 completed |
| P2: Cleanup | 4 | 3 completed |
| **Total** | **31** | **30 completed** |
