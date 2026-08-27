import assert from "node:assert/strict"
import test from "node:test"

import { createClickedCategoryHistory } from "./clickedCategoryHistoryApi.js"

test("DB 작업이 실패해도 서버가 계산한 최종 6컬럼을 Console에 출력한다", async (context) => {
  const originalFetch = globalThis.fetch
  const originalConsoleInfo = console.info
  const messages = []
  const debugRecord = {
    line_id: "P1L",
    sdwt: "SDWT-1",
    grade: "ALL",
    sensor: "ALL",
    update_date: "2026-08-27 14:30:00",
    knox_id: "127.0.0.1",
  }
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({
      ok: false,
      error: "클릭이력 요청을 처리하지 못했습니다.",
      debugRecord,
    }),
  })
  console.info = (message) => messages.push(message)
  context.after(() => {
    globalThis.fetch = originalFetch
    console.info = originalConsoleInfo
  })

  await assert.rejects(() => createClickedCategoryHistory({
    app: "self",
    lineId: "P1L",
    filePaths: ["/appdata/abnormal_trend/pic/erd/chart.png"],
    grades: ["ALL"],
    selectedSensor: "ALL",
    clickedAt: "2026-08-27T14:30:00+09:00",
  }), /클릭이력 요청을 처리하지 못했습니다/)

  const finalMessage = messages.find((message) => message.startsWith("[history-db-final] "))
  assert.ok(finalMessage)
  assert.deepEqual(
    JSON.parse(finalMessage.replace(/^\[history-db-final\] /, "")).record,
    debugRecord,
  )
})
