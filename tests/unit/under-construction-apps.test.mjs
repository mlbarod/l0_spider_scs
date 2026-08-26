import assert from "node:assert/strict"
import test from "node:test"

import {
  getUnderConstructionApp,
  getUnderConstructionPath,
} from "../../src/features/fdc-trend/utils/underConstructionApps.mjs"

const EXPECTED_APPS = [
  ["common-commonality", "공통부 동일성 이상감지"],
  ["fdc-hard-limit", "FDC Hard Limit추천"],
  ["defect-spider", "Defect SPIDER"],
  ["l1-spider", "L1 SPIDER"],
  ["l3-spider", "L3 SPIDER"],
]

test("개발 예정 App은 내부 Under Construction 경로와 표시 정보를 제공한다", () => {
  for (const [appId, title] of EXPECTED_APPS) {
    assert.equal(getUnderConstructionPath(appId), `/under-construction/${appId}`)
    assert.equal(getUnderConstructionApp(appId)?.title, title)
  }
})

test("등록되지 않은 App은 외부 URL 또는 임의 경로로 연결하지 않는다", () => {
  assert.equal(getUnderConstructionApp("unknown-app"), null)
  assert.throws(
    () => getUnderConstructionPath("unknown-app"),
    /Unknown under-construction app/,
  )
})
