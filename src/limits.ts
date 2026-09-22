// Receiver, sender and gateway contracts use UTF-8 serialized bytes.
export { MAX_EVENT_BYTES } from "../egress/limits.mjs";
export function eventBytes(body: string) {
  return new TextEncoder().encode(body).byteLength;
}
