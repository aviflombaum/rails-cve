// Receiver, sender and gateway contracts use UTF-8 serialized bytes.
export const MAX_EVENT_BYTES = 1_048_576;
export function eventBytes(body: string) {
  return new TextEncoder().encode(body).byteLength;
}
