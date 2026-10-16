import assert from "node:assert/strict"
import test from "node:test"
import { Readable } from "node:stream"
import { buildHitHistoryImage, MAX_HISTORY_REQUEST_BYTES } from "./hitHistoryImage.mjs"
import { handleHitHistoryRequest } from "./hitHistory.mjs"

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII="
const input = { requestId: "12345678-abcd-abcd-abcd-123456789012", image: `data:image/png;base64,${png}` }

test("PNG binary validation and actor-scoped stable request ID", () => {
  const snapshot = buildHitHistoryImage(input, "alice")
  assert.equal(snapshot.imageBase64, png)
  assert.match(snapshot.imageId, /^[0-9a-f]{64}$/)
  assert.deepEqual(buildHitHistoryImage(input, "alice"), snapshot)
  assert.notEqual(buildHitHistoryImage(input, "bob").imageId, snapshot.imageId)
  assert.deepEqual(buildHitHistoryImage({}, "alice"), {})
  for (const invalid of [
    { ...input, requestId: "invalid" }, { image: input.image }, { requestId: input.requestId },
    { ...input, image: "data:image/svg+xml;base64," + png },
    { ...input, image: input.image + "=" }, { ...input, image: "data:image/png;base64," + "A".repeat(8 * 1024 * 1024) },
    { ...input, image: "data:image/png;base64," + Buffer.from("not PNG").toString("base64") },
  ]) assert.throws(() => buildHitHistoryImage(invalid, "alice"), TypeError)
  const oversizedDimensions = Buffer.from(png, "base64")
  oversizedDimensions.writeUInt32BE(20000, 16)
  assert.throws(() => buildHitHistoryImage({ ...input, image: "data:image/png;base64," + oversizedDimensions.toString("base64") }, "alice"), TypeError)
})

test("invalid image ID is rejected without running DB helper", async () => {
  const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
  await handleHitHistoryRequest({ method: "GET", url: "/api/hit-history?imageId=../secret" }, res)
  assert.equal(res.status, 400)
})

test("oversized request is rejected with 413", async () => {
  // A missing synthetic DB path prevents any real DB connection.
  const previous = process.env.DB_INFO_PATH
  process.env.DB_INFO_PATH = "/tmp/nonexistent-history-image-test-db.pkl"
  try {
    const req = Object.assign(Readable.from([Buffer.alloc(MAX_HISTORY_REQUEST_BYTES + 1, 65)]), {
      method: "POST", url: "/api/hit-history", headers: {}, socket: { remoteAddress: "192.0.2.22" },
    })
    const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
    await handleHitHistoryRequest(req, res)
    assert.equal(res.status, 413)
  } finally {
    if (previous === undefined) delete process.env.DB_INFO_PATH
    else process.env.DB_INFO_PATH = previous
  }
})
