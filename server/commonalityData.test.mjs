import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCommonalityFilterPayload,
  normalizeCommonalityPathRows,
  scopeCommonalityRows,
} from "./commonalityData.mjs"

const latest = {
  name: "동일성 최신날짜",
  path: "/appdata/abnormal_trend/pic/path_erd_commonality_xian/2026-08-28",
  date: "2026-08-28",
}

function createSourceRow(overrides = {}) {
  return {
    sdwt_code: "SDWT-1",
    step_seq: "100",
    recipe_id: "RECIPE-1",
    priority: "A",
    sensor: "PRESSURE_SENSOR",
    ch_step: "10@001",
    path: "/appdata/abnormal_trend/pic/erd_commonality/2026-08-28/SDWT-1/A/100/RECIPE-1",
    ...overrides,
  }
}

test("동일성 경로 테이블 행을 기존 화면 응답 구조로 변환한다", () => {
  const rows = normalizeCommonalityPathRows([
    createSourceRow(),
    createSourceRow({
      step_seq: 200,
      recipe_id: "RECIPE-2",
      priority: "B",
      sensor: "TEMP",
      ch_step: 20,
      path: "",
      file_path: "/mounted/erd-commonality/SDWT-1/B/200/RECIPE-2",
    }),
    createSourceRow({ path: "relative/path" }),
    createSourceRow({ sensor: "" }),
  ], latest)

  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    id: "0-/appdata/abnormal_trend/pic/erd_commonality/2026-08-28/SDWT-1/A/100/RECIPE-1/img.png",
    latestDate: "2026-08-28",
    sdwt: "SDWT-1",
    grade: "A",
    stepSeq: "100",
    stepDesc: "100",
    ppid: "RECIPE-1",
    duplicatePpid: "RECIPE-1",
    sensor: "PRESSURE_SENSOR",
    chStep: "10@001",
    filePath: "/appdata/abnormal_trend/pic/erd_commonality/2026-08-28/SDWT-1/A/100/RECIPE-1/img.png",
  })
  assert.equal(rows[1].stepDesc, "200")
  assert.equal(rows[1].filePath, "/mounted/erd-commonality/SDWT-1/B/200/RECIPE-2/img.png")
})

test("sdwt_code는 mapping key와 표시 SDWT를 모두 허용해 범위를 제한한다", () => {
  const rows = normalizeCommonalityPathRows([
    createSourceRow(),
    createSourceRow({ sdwt_code: "표시-SDWT-2", recipe_id: "RECIPE-2" }),
  ], latest)

  assert.deepEqual(
    scopeCommonalityRows(rows, { pathSdwt: "RAW-SDWT-2", sdwt: "표시-SDWT-2" }),
    { folderSdwt: "표시-SDWT-2", rows: [rows[1]] },
  )
  assert.throws(
    () => scopeCommonalityRows(rows, { pathSdwt: "UNKNOWN", sdwt: "알 수 없음" }),
    { code: "COMMONALITY_SDWT_NOT_FOUND" },
  )
})

test("step_seq, sensor와 ch_step으로 종속 필터 데이터를 생성한다", () => {
  const rows = normalizeCommonalityPathRows([
    createSourceRow(),
    createSourceRow({ recipe_id: "RECIPE-2", ch_step: "20@001" }),
    createSourceRow({ step_seq: "200", sensor: "TEMP", ch_step: "30@001" }),
  ], latest)
  const index = { latestPath: latest, folderSdwt: "SDWT-1", rows }

  const stepOptionsPayload = buildCommonalityFilterPayload(index, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    stepDesc: "",
    sensor: "",
    chStep: "",
  })
  assert.deepEqual(stepOptionsPayload.stepSeqs, ["100", "200"])
  assert.deepEqual(stepOptionsPayload.stepDescs, ["100", "200"])
  assert.deepEqual(stepOptionsPayload.sensors, [])
  assert.equal(stepOptionsPayload.rows.length, 0)

  const payload = buildCommonalityFilterPayload(index, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    stepSeq: "100",
    sensor: "PRESSURE_SENSOR",
    chStep: "20@001",
  })
  assert.deepEqual(payload.sensors, ["PRESSURE_SENSOR"])
  assert.equal(payload.filters.stepSeq, "100")
  assert.deepEqual(payload.chSteps, ["10@001", "20@001"])
  assert.equal(payload.rows.length, 1)
  assert.equal(payload.rows[0].ppid, "RECIPE-2")

  const allSensorsPayload = buildCommonalityFilterPayload(index, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    stepSeq: "100",
    sensor: "ALL",
    chStep: "ALL",
  })
  assert.equal(allSensorsPayload.filters.sensor, "ALL")
  assert.deepEqual(allSensorsPayload.chSteps, ["ALL"])
  assert.equal(allSensorsPayload.rows.length, 2)

  const legacyPayload = buildCommonalityFilterPayload(index, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    stepDesc: "200",
    sensor: "",
    chStep: "",
  })
  assert.equal(legacyPayload.filters.stepSeq, "200")
  assert.equal(legacyPayload.filters.stepDesc, "200")
})
