export type StreamLike = {
  write: (chunk: string) => boolean | void
}
