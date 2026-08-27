import assert from "node:assert/strict"
import test from "node:test"

import { createHitHistory } from "./hitHistoryApi.js"
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

test("자설비 이력저장 API는 updateDate와 sdwt를 file_path와 함께 전달한다", async (context) => {
  const originalFetch = globalThis.fetch
  let requestBody
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return {
      ok: true,
      json: async () => ({
        ok: true,
        affectedRows: 1,
      }),
    }
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  await createHitHistory({
    lineId: "P1L",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    filePath: "/mounted/runtime/path_xian/result",
    execDate: "2026-08-27T13:05:00+09:00",
  })

  assert.deepEqual(requestBody, {
    lineId: "P1L",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    filePath: "/mounted/runtime/path_xian/result",
    execDate: "2026-08-27T13:05:00+09:00",
  })
})
