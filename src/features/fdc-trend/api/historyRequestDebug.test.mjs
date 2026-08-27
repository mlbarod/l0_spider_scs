import assert from "node:assert/strict"
import test from "node:test"

import { logHistoryDbFinal, logHistoryRequest } from "./historyRequestDebug.js"

test("이력 DB 요청 endpoint와 body를 JSON 한 줄로 출력한다", () => {
  const messages = []
  const body = {
    lineId: "LINE-1",
    filePath: "/appdata/abnormal_trend/pic/erd/chart.png",
  }

  const payload = logHistoryRequest({
    endpoint: "/api/hit-history",
    body,
  }, (message) => messages.push(message))

  assert.deepEqual(payload, {
    endpoint: "/api/hit-history",
    method: "POST",
    body,
  })
  assert.equal(messages.length, 1)
  assert.match(messages[0], /^\[history-db-request\] /)
  assert.deepEqual(JSON.parse(messages[0].replace(/^\[history-db-request\] /, "")), payload)
})

test("클릭이력 최종 DB 6컬럼을 JSON 한 줄로 출력한다", () => {
  const messages = []
  const record = {
    line_id: "LINE-1",
    sdwt: "SDWT-1",
    grade: "ALL",
    sensor: "ALL",
    update_date: "2026-08-27 14:30:00",
    knox_id: "127.0.0.1",
  }

  const payload = logHistoryDbFinal({
    table: "clicked_category_history",
    operation: "INSERT",
    record,
  }, (message) => messages.push(message))

  assert.deepEqual(payload.record, record)
  assert.equal(messages.length, 1)
  assert.deepEqual(
    JSON.parse(messages[0].replace(/^\[history-db-final\] /, "")),
    payload,
  )
})
