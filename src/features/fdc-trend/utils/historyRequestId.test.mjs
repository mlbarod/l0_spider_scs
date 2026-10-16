import assert from "node:assert/strict"
import { webcrypto } from "node:crypto"
import test from "node:test"
import { createHistoryRequestId } from "./historyRequestId.mjs"

test("native randomUUID is used when supported", () => {
  const provider = { randomUUID() { assert.equal(this, provider); return "native-uuid" } }
  assert.equal(createHistoryRequestId(provider), "native-uuid")
})

test("HTTP fallback produces a UUID v4 with the correct version and variant", () => {
  const provider = { getRandomValues(bytes) { assert.equal(this, provider); return bytes.fill(255) } }
  assert.equal(createHistoryRequestId(provider), "ffffffff-ffff-4fff-bfff-ffffffffffff")
  const secureFallback = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }
  const ids = Array.from({ length: 100 }, () => createHistoryRequestId(secureFallback))
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
})

test("missing secure randomness returns a user-readable error", () => {
  assert.throws(() => createHistoryRequestId(null), /이력 저장 요청 ID를 생성할 수 없습니다/)
  assert.throws(() => createHistoryRequestId({}), /이력 저장 요청 ID를 생성할 수 없습니다/)
})
