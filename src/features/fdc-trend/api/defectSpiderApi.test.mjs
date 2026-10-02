import assert from "node:assert/strict"
import test from "node:test"
import { fetchDefectFilters } from "./defectSpiderApi.js"

test("읽기 실패 응답의 실제 경로를 화면에 전달할 오류 객체에 보존한다", async (t) => {
  const sourcePath = "/appdata/abnormal_trend/pic/defect/L1/DEVICE-A/fail_list.parquet"
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    json: async () => ({ error: "파일 읽기 실패", source_path: sourcePath }),
  }))
  await assert.rejects(fetchDefectFilters({ line: "L1", pathSdwt: "TEAM-A" }), (error) => {
    assert.equal(error.message, "파일 읽기 실패")
    assert.equal(error.sourcePath, sourcePath)
    return true
  })
})

test("서버가 경로를 반환하지 않은 오류는 경로를 추측하지 않는다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    json: async () => ({ error: "설정 오류" }),
  }))
  await assert.rejects(fetchDefectFilters({ line: "L1", pathSdwt: "TEAM-A" }), (error) => {
    assert.equal(error.sourcePath, "")
    return true
  })
})
