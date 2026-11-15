import assert from "node:assert/strict"
import test from "node:test"

import { createHistoryPost } from "./historyBoardApi.js"
import { createPassHistory } from "./passHistoryApi.js"

const passFields = {
  updateDate: "2026-08-27 13:00:00",
  sdwt: "SDWT-1",
  desc: "RECIPE-1",
  ver: "V1",
  recipeId: "RECIPE-1",
  priority: "A",
  sensor: "TEMP",
  step: "10@MAIN",
  eqp: "EQP-1",
}

test("자설비 SKIP API는 chart row의 PASS 이력 필드를 POST body로 전달한다", async (context) => {
  const originalFetch = globalThis.fetch
  let requestBody
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return { ok: true, json: async () => ({ ok: true, affectedRows: 1 }) }
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  await createPassHistory({
    lineId: "P1L",
    filePath: "/mounted/runtime/path_xian/result",
    ...passFields,
    comment: "점검",
    execDate: "2026-08-27T13:05:00+09:00",
  })

  assert.deepEqual(requestBody, {
    lineId: "P1L",
    filePath: "/mounted/runtime/path_xian/result",
    ...passFields,
    comment: "점검",
    execDate: "2026-08-27T13:05:00+09:00",
  })
})

test("이력저장 게시판 API는 등록 구분·차트 정보와 file_path를 POST body로 전달한다", async (context) => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, method: options.method, body: JSON.parse(options.body) }
    return { ok: true, json: async () => ({ ok: true, id: "a".repeat(64), created: true }) }
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  const input = {
    entryType: "HISTORY",
    title: "[SPIDER] title",
    details: "Line: P1L",
    comment: "Please review the anomaly detection details.",
    app: "self-equipment",
    lineId: "P1L",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    filePath: "/mounted/runtime/path_xian/result",
    image: "data:image/png;base64,AAAA",
    requestId: "00000000-0000-4000-8000-000000000000",
  }
  const result = await createHistoryPost(input)

  assert.equal(request.url, "/api/history-board")
  assert.equal(request.method, "POST")
  assert.deepEqual(request.body, input)
  assert.equal(result.created, true)
})
