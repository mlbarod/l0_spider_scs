import { createHash } from "node:crypto"

export const MAX_HISTORY_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_HISTORY_REQUEST_BYTES = 4 * Math.ceil(MAX_HISTORY_IMAGE_BYTES / 3) + 65536
const prefix = "data:image/png;base64,"
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildHitHistoryImage(input, actor) {
  // Keep the existing metadata-only POST contract for older clients.
  if (input.image === undefined && input.requestId === undefined) return {}
  if (typeof input.requestId !== "string" || !requestIdPattern.test(input.requestId)) {
    throw new TypeError("이력 저장 요청 ID를 확인해 주세요.")
  }
  if (typeof input.image !== "string" || !input.image.startsWith(prefix)) {
    throw new TypeError("PNG 차트 이미지가 필요합니다.")
  }
  const base64 = input.image.slice(prefix.length)
  if (!base64.length || base64.length > 4 * Math.ceil(MAX_HISTORY_IMAGE_BYTES / 3)
    || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new TypeError("차트 이미지의 Base64 형식 또는 5MB 제한을 확인해 주세요.")
  }
  const png = Buffer.from(base64, "base64")
  if (png.length > MAX_HISTORY_IMAGE_BYTES || png.toString("base64") !== base64
    || png.length < 45 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR"
    || !png.readUInt32BE(16) || !png.readUInt32BE(20)
    || png.readUInt32BE(16) > 16384 || png.readUInt32BE(20) > 16384
    || png.readUInt32BE(16) * png.readUInt32BE(20) > 40000000
    || png.subarray(-12).toString("hex") !== "0000000049454e44ae426082") {
    throw new TypeError("PNG 차트 이미지를 확인해 주세요.")
  }
  return {
    imageId: createHash("sha256").update(`hit-history\0${actor}\0${input.requestId.toLowerCase()}`).digest("hex"),
    imageBase64: base64,
  }
}
