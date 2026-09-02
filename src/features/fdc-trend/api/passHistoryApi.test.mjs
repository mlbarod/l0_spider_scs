import assert from "node:assert/strict"
import test from "node:test"

import { fetchSkipListData } from "./passHistoryApi.js"

test("자설비 SKIP LIST는 PRC_Group 조건을 API에 전달한다", async (t) => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return { ok: true, json: async () => ({ rows: [] }) }
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  await fetchSkipListData({
    lineId: "P1L",
    priorities: ["A"],
    prcGroup: "ETCH",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.match(requestedUrl, /(?:\?|&)prcGroup=ETCH(?:&|$)/)
  assert.doesNotMatch(requestedUrl, /(?:\?|&)desc=/)
})
