import assert from "node:assert/strict"
import test from "node:test"
import { filterItems } from "./filterSearch.mjs"

const items = ["AbC sensor", "def sensor", "한글 센서", "a.b", "axb"].map((label) => ({ label }))

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
