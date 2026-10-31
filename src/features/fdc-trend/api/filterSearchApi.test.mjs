import assert from "node:assert/strict"
import test from "node:test"
import { fetchSelfEquipmentData, fetchMyEqpEquipmentData } from "./selfEquipmentApi.js"
import { fetchCommonalityData } from "./commonalityApi.js"
import { fetchCommonCommonalityData } from "./commonCommonalityApi.js"
import { fetchSkipListData } from "./passHistoryApi.js"
import { readFilterSearchParams } from "../utils/filterSearch.mjs"

test("각 조회 API는 ALL 검색 범위를 같은 방식으로 전달하며 생략 시 기존 요청을 유지한다", async (t) => {
  const urls = []
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(new URL(url, "http://localhost"))
    return { ok: true, json: async () => ({ rows: [] }) }
  })
  const filterSearch = { sensor: { text: "temp & 中", mode: "exclude" }, chStep: { text: "10", mode: "include" } }
  for (const fetchData of [fetchSelfEquipmentData, fetchMyEqpEquipmentData, fetchCommonalityData, fetchCommonCommonalityData, fetchSkipListData]) {
    const selection = { line: "L1", lineId: "L1", pathSdwt: "RAW", sdwt: "TEAM", priorities: ["A"], sensor: "ALL", chStep: "ALL" }
    await fetchData({ ...selection, filterSearch })
    assert.deepEqual(readFilterSearchParams(urls.at(-1).searchParams), filterSearch)
    assert.equal(urls.at(-1).searchParams.has("filterSearch"), false)
    await fetchData(selection)
    assert.deepEqual(readFilterSearchParams(urls.at(-1).searchParams), {})
  }
})
