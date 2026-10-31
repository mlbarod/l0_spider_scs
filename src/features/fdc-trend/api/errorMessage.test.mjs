import assert from "node:assert/strict"
import test from "node:test"

import { getApiErrorMessage, sanitizeErrorMessage } from "./errorMessage.js"

test("오류 메시지의 Unix 및 Windows 절대 파일 경로를 숨긴다", () => {
  assert.equal(
    sanitizeErrorMessage("ENOENT: stat '/appdata/abnormal_trend/pic/erd/data.parquet'"),
    "ENOENT: stat [file path hidden]",
  )
  assert.equal(
    sanitizeErrorMessage("읽기 실패 C:\\data\\erd\\data.parquet"),
    "읽기 실패 [file path hidden]",
  )
  assert.equal(
    sanitizeErrorMessage("Traceback: scripts/pass_history.py 파일 처리 실패"),
    "Traceback: [file path hidden] 파일 처리 실패",
  )
})

test("경로가 없는 오류 메시지와 fallback은 그대로 사용한다", () => {
  assert.equal(sanitizeErrorMessage("조회 조건이 올바르지 않습니다."), "조회 조건이 올바르지 않습니다.")
  assert.equal(getApiErrorMessage({}, "데이터를 불러오지 못했습니다."), "데이터를 불러오지 못했습니다.")
})

test("구분자 바로 뒤의 경로·루트 파일·파일 URI·공유 경로도 숨긴다", () => {
  for (const path of ["/data.parquet", "/appdata/pm/data.parquet", "C:\\data\\pm.parquet", "file:///appdata/pm.parquet", "\\\\server\\share\\pm.parquet"]) {
    assert.equal(sanitizeErrorMessage(`로드 실패: ${path}`), "로드 실패: [file path hidden]")
    assert.equal(sanitizeErrorMessage(`path=${path}`), "path=[file path hidden]")
    assert.equal(sanitizeErrorMessage(`경로:${path}`), "경로:[file path hidden]")
  }
  assert.equal(sanitizeErrorMessage('읽기 실패 "\\\\server\\shared folder\\pm.parquet"'), "읽기 실패 [file path hidden]")
  assert.equal(sanitizeErrorMessage("HTTP 404: https://example.com/help"), "HTTP 404: https://example.com/help")
})

test("안전한 문의 코드는 오류 메시지에 표시하고 잘못된 값은 무시한다", () => {
  assert.equal(
    getApiErrorMessage({ error: "조회 실패", requestId: "123e4567-e89b-12d3-a456-426614174000" }),
    "조회 실패 [Support code: 123e4567-e89b-12d3-a456-426614174000]",
  )
  assert.equal(
    getApiErrorMessage({ error: "조회 실패", requestId: "../../secret" }),
    "조회 실패",
  )
})
