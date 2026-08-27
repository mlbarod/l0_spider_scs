import assert from "node:assert/strict"
import test from "node:test"

import { logHistoryRequest } from "./historyRequestDebug.js"

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
