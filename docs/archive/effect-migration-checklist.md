# Effect Migration Checklist (LLM Use)

Use this checklist when migrating code to strict Effect-first architecture.

## 1) Identify Side Effects

- [ ] Locate all async work, I/O, timers, storage, network calls, and global singletons.
- [ ] Classify each side effect as external dependency vs pure logic.

## 2) Define Service Tags

- [ ] Create a `Context.Tag` for each dependency (DB, fetch, storage, audio, external APIs).
- [ ] Expose a minimal, typed interface for each service.

## 3) Build Layers

- [ ] Implement `Layer` for each service (live implementations only).
- [ ] Avoid global singletons in domain logic.
- [ ] Provide configuration via a dedicated Env/Config service.
- [ ] Use `ConfigProvider.fromEnv` + `Layer.setConfigProvider` for env loading.
- [ ] Validate required env/config at startup (fail fast).

## 4) Refactor Domain Logic to Effect

- [ ] Replace `async/await` with `Effect.gen`.
- [ ] Replace `try/catch` with `Effect.try`, `Effect.tryPromise`, and typed errors.
- [ ] Use `Effect.fail` with `Data.TaggedClass` errors for all failures.

## 5) Error Recovery (Typed Errors)

- [ ] Use `Effect.catchTag` or `Effect.catchAll` for recovery.
- [ ] Do not swallow errors in domain logic.
- [ ] Treat unexpected errors as defects; handle with `Effect.catchAllDefect` if needed.

## 6) Timeouts and Retries

- [ ] Add `Effect.timeout` for all external calls.
- [ ] Add `Effect.retry` (or `Schedule`) for transient errors.
- [ ] Use backoff and max retries; keep failure typed.

## 7) Fanout and Parallelism

- [ ] Use `Effect.all` with `concurrency` for fanout.
- [ ] Use `Effect.firstSuccessOf` for racing providers.
- [ ] Avoid `Promise.all` in domain logic.

## 8) Resource Safety

- [ ] Use `Effect.acquireRelease` and `Scope` for streams, audio, and subscriptions.
- [ ] Remove manual cleanup where Effect can manage lifecycle.

## 9) Composition Root

- [ ] Provide all Layers at the boundary (Next.js route or client runtime).
- [ ] Run Effects via `Effect.runPromiseExit` (server) or a shared `Runtime` (client).

## 10) Tests

- [ ] Substitute services with test Layers.
- [ ] Write tests using Effect Test utilities or pure effects.

## 11) Docs and LLM Guidance

- [ ] Update `docs/architecture.md` if new services are added.
- [ ] Keep `AGENTS.md` aligned with Effect-first requirements.
