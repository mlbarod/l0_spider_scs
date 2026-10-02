import assert from "node:assert/strict"
import test from "node:test"
import { fetchDefectFilters, fetchDefectFile } from "./defectSpiderApi.js"

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

test("ALL은 값 필터와 구분해 두 API에 전달한다", async (t) => {
  const urls = []
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(new URL(url, "http://localhost"))
    return { ok: true, json: async () => ({}) }
  })
  const selection = { line: "L1", pathSdwt: "A", prcGroup: "ETCH", mainSeq: null, metSeq: null }
  await fetchDefectFilters(selection)
  await fetchDefectFile({ ...selection, filePath: "/fixture/all_1.parquet" })
  for (const url of urls) {
    assert.equal(url.searchParams.get("mainAll"), "1")
    assert.equal(url.searchParams.get("metAll"), "1")
    assert.equal(url.searchParams.has("mainSeq"), false)
  }
  await fetchDefectFilters({ ...selection, mainSeq: "ALL", metSeq: "0" })
  assert.equal(urls[2].searchParams.get("mainSeq"), "ALL")
  assert.equal(urls[2].searchParams.get("metSeq"), "0")
  assert.equal(urls[2].searchParams.has("mainAll"), false)
})
