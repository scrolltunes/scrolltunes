import { Data } from "effect"

export class SpeechAllTiersFailedError extends Data.TaggedClass("SpeechAllTiersFailedError")<{
  readonly message: string
  readonly googleError?: SpeechError
  readonly webSpeechError?: SpeechError
}> {}

export class SpeechAPIError extends Data.TaggedClass("SpeechAPIError")<{
  readonly code: string
  readonly message: string
}> {}

export class SpeechNetworkError extends Data.TaggedClass("SpeechNetworkError")<{
  readonly message: string
}> {}

export class SpeechNotSupportedError extends Data.TaggedClass("SpeechNotSupportedError")<{
  readonly message: string
}> {}

export class SpeechPermissionError extends Data.TaggedClass("SpeechPermissionError")<{
  readonly message: string
}> {}

export class SpeechQuotaError extends Data.TaggedClass("SpeechQuotaError")<{
  readonly message: string
}> {}

export class WebSpeechError extends Data.TaggedClass("WebSpeechError")<{
  readonly code: string
  readonly message: string
}> {}

export type SpeechError =
  | SpeechAllTiersFailedError
  | SpeechAPIError
  | SpeechNetworkError
  | SpeechNotSupportedError
  | SpeechPermissionError
  | SpeechQuotaError
  | WebSpeechError
