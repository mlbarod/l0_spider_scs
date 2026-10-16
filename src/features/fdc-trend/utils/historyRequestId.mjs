export function createHistoryRequestId(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID === "function") return cryptoProvider.randomUUID()
  // randomUUID requires a secure context; getRandomValues also works on HTTP.
  if (typeof cryptoProvider?.getRandomValues !== "function") {
    throw new Error("이력 저장 요청 ID를 생성할 수 없습니다. 지원되는 브라우저에서 다시 시도해 주세요.")
  }
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
