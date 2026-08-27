import assert from "node:assert/strict"
import test from "node:test"

import { readSelfEquipmentUrlFilters } from "../../src/features/fdc-trend/utils/selfEquipmentUrlFilters.mjs"

test("일반 자설비의 opaque step과 eqpCh는 URLSearchParams round trip 후 보존된다", () => {
  const stepValue = "synthetic-token+/=% 한글"
  const eqpChValue = "SYNTH EQP/+ 01"
  const sourceUrl = new URL("/self-equipment", "http://localhost")
  sourceUrl.searchParams.set("line", "SYNTH_LINE")
  sourceUrl.searchParams.set("sdwt", "SYNTH_SDWT")
  sourceUrl.searchParams.set("grade", "D")
  sourceUrl.searchParams.set("step", stepValue)
  sourceUrl.searchParams.set("eqpCh", eqpChValue)

  const roundTrippedUrl = new URL(sourceUrl.href)
  const filters = readSelfEquipmentUrlFilters(roundTrippedUrl.searchParams)

  assert.equal(filters.stepToken, stepValue)
  assert.equal(filters.eqpCh, eqpChValue)
})

test("eqpCh는 legacy eqp_ch보다 우선하며 누락 시 alias를 사용한다", () => {
  const primary = readSelfEquipmentUrlFilters(
    new URLSearchParams("eqpCh=SYNTH_PRIMARY&eqp_ch=SYNTH_LEGACY"),
  )
  const legacy = readSelfEquipmentUrlFilters(
    new URLSearchParams("eqp_ch=SYNTH_LEGACY"),
  )

  assert.equal(primary.eqpCh, "SYNTH_PRIMARY")
  assert.equal(legacy.eqpCh, "SYNTH_LEGACY")
})
