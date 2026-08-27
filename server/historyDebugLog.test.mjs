import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import test from "node:test"

import {
  attachHistoryDbWriteLogger,
  forwardHistoryDbWriteOutput,
  logHistoryDbAttempt,
} from "./historyDebugLog.mjs"

test("DB write debug 줄만 서버 로그로 전달한다", () => {
  const messages = []
  forwardHistoryDbWriteOutput([
    "internal database error detail",
    "[history-db-write] {\"table\":\"hit_history\"}",
    "",
  ].join("\n"), (message) => messages.push(message))

  assert.deepEqual(messages, [
    "[history-db-write] {\"table\":\"hit_history\"}",
  ])
})

test("분할된 stderr chunk의 DB write JSON을 한 줄로 복원한다", () => {
  const stderr = new EventEmitter()
  const messages = []
  attachHistoryDbWriteLogger({ stderr }, (message) => messages.push(message))

  stderr.emit("data", "[history-db-write] {\"table\":\"pass_")
  stderr.emit("data", "history\",\"rows\":[]}\nignored error")
  stderr.emit("end")

  assert.deepEqual(messages, [
    "[history-db-write] {\"table\":\"pass_history\",\"rows\":[]}",
  ])
})

test("helper 실행 전 DB attempt payload를 출력한다", () => {
  const messages = []
  const payload = {
    table: "pass_history",
    operation: "INSERT",
    records: [{ filePath: "/appdata/chart.png" }],
  }

  assert.equal(logHistoryDbAttempt(payload, (message) => messages.push(message)), payload)
  assert.deepEqual(messages, [
    `[history-db-attempt] ${JSON.stringify(payload)}`,
  ])
})
