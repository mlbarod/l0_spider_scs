import assert from "node:assert/strict"
import test from "node:test"

import { buildSelfEquipmentPayload } from "../../server/selfEquipmentData.mjs"

function createSyntheticRow(overrides = {}) {
  return {
    line_rev: "SYNTH_LINE",
    sdwt: "SYNTH_SDWT",
    desc: "SYNTH_STEP_ALPHA",
    ver: "SYNTH_VERSION",
    recipe_id: "SYNTH_RECIPE",
    priority: "D",
    sensor: "SYNTH_SENSOR",
    step: "SYNTH_CH_STEP",
    eqp: "SYNTH_EQP_01.png",
    file_path: "SYNTHETIC_FILE_NOT_READ",
    ...overrides,
  }
}

test("일반 Self Equipment payload는 실제 RECIPE_ID가 없으면 ALL을 선택하지 않는다", () => {
  const payload = buildSelfEquipmentPayload([
    createSyntheticRow(),
    createSyntheticRow({ recipe_id: "SYNTH_RECIPE_BETA" }),
  ], {
    line: "SYNTH_LINE",
    pathSdwt: "SYNTH_SDWT",
    sdwt: "SYNTH_SDWT",
    priorities: ["D"],
    desc: "ALL",
    eqpCh: "SYNTH_EQP_01.png",
    sensor: "",
    chStep: "",
  })

  assert.equal(payload.filters.desc, "")
  assert.deepEqual(payload.eqpChannels, [])
})
