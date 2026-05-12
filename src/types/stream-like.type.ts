export type StreamLike = {
  write: <T = unknown>(chunk: T) => boolean | void
}
