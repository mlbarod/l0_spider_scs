import assert from "node:assert/strict"
import test from "node:test"
import { filterItems, filterItemsWithAll, getAllFilterSearch, appendFilterSearchParams, readFilterSearchParams } from "./filterSearch.mjs"

const items = ["AbC sensor", "def sensor", "한글 센서", "a.b", "axb"].map((label) => ({ label }))

test("ALL은 검색에서 제외하고 표시 후보의 행 수를 집계하며 검색 결과가 없으면 표시하지 않는다", () => {
  const options = [{ value: "ALL", label: "ALL", meta: "9 rows" },
    { value: "A", label: "alpha", rowCount: 2 }, { value: "B", label: "beta", rowCount: 7 }]
  const found = filterItemsWithAll(options, { text: "alpha", mode: "exclude" })
  assert.deepEqual(found.map((item) => item.value), ["ALL", "B"])
  assert.equal(found[0].meta, "7 rows")
  assert.deepEqual(filterItemsWithAll(options, "alpha").map((item) => item.value), ["ALL", "A"])
  assert.deepEqual(filterItemsWithAll(options, "missing"), [])
  assert.deepEqual(filterItemsWithAll(options, "ALL"), [])
  assert.equal(filterItemsWithAll(options, "")[0].meta, "9 rows")
})

test("ALL에만 검색 조건을 전달하고 빈 검색은 제한을 제거하며 API 직렬화로 특수문자를 보존한다", () => {
  const search = getAllFilterSearch({ prcGroup: "ALL", sensor: "TEMP", eqpCh: "ALL", chStep: "ALL" }, {
    prcGroup: { text: " A&B+中 ", mode: "exclude" }, sensor: "TEMP", eqpCh: "", chStep: "10",
  })
  assert.deepEqual(search, { prcGroup: { text: "A&B+中", mode: "exclude" }, chStep: { text: "10", mode: "include" } })
  const params = new URLSearchParams()
  appendFilterSearchParams(params, search)
  assert.deepEqual(readFilterSearchParams(new URLSearchParams(params.toString())), search)
  assert.deepEqual(getAllFilterSearch({ sensor: "ALL" }, { sensor: " " }), {})
})

test("포함·제외는 대소문자와 앞뒤 공백을 무시하고 서로 반대 항목을 표시한다", () => {
  assert.deepEqual(filterItems(items, " ABC "), [items[0]])
  assert.deepEqual(filterItems(items, { text: " ABC ", mode: "include" }), [items[0]])
  assert.deepEqual(filterItems(items, { text: " ABC ", mode: "exclude" }), items.slice(1))
  assert.deepEqual(filterItems(items, { text: "센서", mode: "exclude" }), items.filter((item) => item !== items[2]))
})

test("빈 검색어는 제외 모드에서도 전체를 표시하며, 기존 빈 문자열 초기화는 포함 검색으로 돌아간다", () => {
  for (const query of ["", { text: "", mode: "exclude" }, { text: "  ", mode: "include" }]) {
    assert.equal(filterItems(items, query), items)
  }
})

test("특수문자는 정규식이 아닌 문자열로 검색하고 일치 항목이 없으면 제외는 전체를 표시한다", () => {
  assert.deepEqual(filterItems(items, { text: "a.b", mode: "exclude" }), items.filter((item) => item !== items[3]))
  assert.deepEqual(filterItems(items, { text: "missing", mode: "include" }), [])
  assert.deepEqual(filterItems(items, { text: "missing", mode: "exclude" }), items)
  assert.deepEqual(filterItems([], { text: "abc", mode: "exclude" }), [])
})
