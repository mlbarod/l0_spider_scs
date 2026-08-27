import assert from "node:assert/strict"
import test from "node:test"

import {
  COMMON_PASS_HISTORY_VERSION,
  PASS_HISTORY_ACTIVE_DURATION_MS,
  SELF_SKIP_LIST_PATH_SDWT,
  buildPassHistoryDbRecord,
  buildPassHistoryRecord,
  buildCommonPassHistoryFilterPayload,
  buildPassHistoryFilterPayload,
  parseCommonPassHistoryPath,
} from "./passHistory.mjs"

const NOW = Date.parse("2026-07-17T15:00:00+09:00")

test("자설비 SKIP은 chart row 필드로 PASS record를 만들고 file_path 형식에 의존하지 않는다", () => {
  assert.deepEqual(buildPassHistoryRecord({
    lineId: "P1L",
    filePath: "/mounted/runtime/path_xian/result",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    ver: "V1",
    recipeId: "RECIPE-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1.png",
    knoxId: "10.0.0.1",
    execDate: "2026-08-27T13:05:00+09:00",
    comment: "점검",
  }), {
    lineId: "P1L",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    ver: "V1",
    recipeId: "RECIPE-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    knoxId: "10.0.0.1",
    execDate: "2026-08-27T13:05:00+09:00",
    comment: "점검",
  })
  assert.deepEqual(buildPassHistoryDbRecord({
    lineId: "P1L",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    ver: "V1",
    recipeId: "RECIPE-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    knoxId: "10.0.0.1",
    execDate: "2026-08-27T13:05:00+09:00",
    comment: "점검",
  }), {
    line_id: "P1L",
    ver: "V1",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    recipe_id: "RECIPE-1",
    update_date: "2026-08-27 13:00:00",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    knox_id: "10.0.0.1",
    exec_date: "2026-08-27 13:05:00",
    comment: "점검",
  })
})

test("자설비 SKIP은 file_path의 ver를 추정하지 않고 요청 row의 ver 컬럼을 요구한다", () => {
  assert.throws(() => buildPassHistoryRecord({
    lineId: "P1L",
    filePath: "/appdata/abnormal_trend/pic_server2/erd/2026-08-27/SDWT-1/RECIPE-1/PATH-V9/PPID-1/A/TEMP/10@MAIN/EQP-1.png",
    updateDate: "2026-08-27",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    recipeId: "PPID-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    knoxId: "10.0.0.1",
  }), /자설비 SKIP ver 정보를 확인하지 못했습니다/)
})

test("자설비 SKIP은 선택 row의 ver가 비어 있으면 저장을 거부한다", () => {
  const input = {
    lineId: "P1L",
    filePath: "/mounted/runtime/path_xian/result",
    updateDate: "2026-08-27",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    recipeId: "PPID-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    knoxId: "10.0.0.1",
  }

  assert.throws(
    () => buildPassHistoryRecord(input),
    /자설비 SKIP ver 정보를 확인하지 못했습니다/,
  )
  assert.equal(
    buildPassHistoryRecord(
      { ...input, filePath: "" },
      { allowMissingSelfVersion: true },
    ).ver,
    "",
  )
})

test("SKIP LIST는 eqp_ch ALL과 sensor ALL 조합에서 ch_step ALL과 전체 행을 유지한다", () => {
  const records = [
    {
      line_id: "P1L",
      ver: "V1",
      sdwt: "SDWT-1",
      desc: "RECIPE-1",
      recipe_id: "PPID-1",
      update_date: "2026-07-17",
      priority: "A",
      sensor: "TEMP",
      step: "10@MAIN",
      eqp: "EQP-1",
      exec_date: "2026-07-17 14:00:00",
    },
    {
      line_id: "P1L",
      ver: "V1",
      sdwt: "SDWT-1",
      desc: "RECIPE-1",
      recipe_id: "PPID-1",
      update_date: "2026-07-17",
      priority: "A",
      sensor: "PRESSURE",
      step: "20@MAIN",
      eqp: "EQP-2",
      exec_date: "2026-07-17 14:00:00",
    },
  ]
  const payload = buildPassHistoryFilterPayload(records, {
    lineId: "P1L",
    priorities: ["A"],
    desc: "RECIPE-1",
    eqpCh: "ALL",
    sensor: "ALL",
    chStep: "ALL",
  }, NOW)

  assert.equal(payload.filters.eqpCh, "ALL")
  assert.equal(payload.filters.sensor, "ALL")
  assert.equal(payload.filters.chStep, "ALL")
  assert.equal(payload.filters.pathSdwt, SELF_SKIP_LIST_PATH_SDWT)
  assert.deepEqual(payload.chSteps.map((item) => item.step).sort(), ["10@MAIN", "20@MAIN"])
  assert.equal(payload.rows.length, 2)
  assert.ok(payload.rows.every((row) => row.path_sdwt === SELF_SKIP_LIST_PATH_SDWT))
  assert.ok(payload.rows.every((row) => row.latest_date === "2026-07-17"))
})

test("과거 빈 ver SKIP도 필터 행으로 반환해 SKIP해제할 수 있다", () => {
  const record = {
    line_id: "P1L",
    ver: "",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    recipe_id: "PPID-1",
    update_date: "2026-07-17",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    exec_date: "2026-07-17 14:00:00",
  }
  const payload = buildPassHistoryFilterPayload([record], {
    lineId: "P1L",
    priorities: ["A"],
    desc: "RECIPE-1",
    eqpCh: "EQP-1",
    sensor: "TEMP",
    chStep: "ALL",
  }, NOW)

  assert.equal(payload.rows.length, 1)
  assert.equal(payload.rows[0].file_path, "")
  assert.equal(payload.rows[0].pass_history, record)
})

test("공통부 data.parquet 경로를 pass_history 값으로 변환한다", () => {
  const values = parseCommonPassHistoryPath(
    "/appdata/abnormal_trend/pic/common/2026-07-17/SDWT-1/ETCH/A/TEMP/10/data.parquet",
    { eqp: "EQP-1.png", prcGroup: "PRC-GROUP-1" },
  )

  assert.deepEqual(values, {
    updateDate: "2026-07-17",
    sdwt: "SDWT-1",
    desc: "ETCH",
    ver: COMMON_PASS_HISTORY_VERSION,
    recipeId: "PRC-GROUP-1",
    priority: "A",
    sensor: "TEMP",
    step: "10",
    eqp: "EQP-1",
  })
})

test("공통부 PASS 이력은 자설비 SKIP LIST 필터에서 제외한다", () => {
  const payload = buildPassHistoryFilterPayload([
    {
      line_id: "P1L",
      ver: COMMON_PASS_HISTORY_VERSION,
      sdwt: "SDWT-1",
      desc: "ETCH",
      recipe_id: "PRC-GROUP-1",
      update_date: "2026-07-17",
      priority: "A",
      sensor: "TEMP",
      step: "10",
      eqp: "EQP-1",
    },
  ], {
    lineId: "P1L",
    priorities: ["A"],
    desc: "",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.equal(payload.counts.filteredRows, 0)
  assert.deepEqual(payload.rows, [])
})

test("공통부 PASS 이력을 공통부 SKIP LIST 이미지 행으로 복원한다", () => {
  const commonRecord = {
    line_id: "P1L",
    ver: COMMON_PASS_HISTORY_VERSION,
    sdwt: "SDWT-1",
    desc: "ETCH",
    recipe_id: "PRC-GROUP-1",
    update_date: "2026-07-17",
    priority: "A",
    sensor: "TEMP",
    step: "10",
    eqp: "EQP-1",
    exec_date: "2026-07-17 12:00:00",
  }
  const payload = buildCommonPassHistoryFilterPayload([
    commonRecord,
    { ...commonRecord, ver: "V1", eqp: "SELF-EQP" },
  ], {
    lineId: "P1L",
    prcGroup: "PRC-GROUP-1",
    eqp: "ALL",
    sensor: "TEMP",
  }, NOW)

  assert.equal(COMMON_PASS_HISTORY_VERSION, "NA")
  assert.equal(payload.filters.sdwt, "SKIP LIST")
  assert.equal(payload.rows.length, 1)
  assert.equal(
    payload.rows[0].data_path,
    "/appdata/abnormal_trend/pic/common/2026-07-17/SDWT-1/ETCH/A/TEMP/10/data.parquet",
  )
  assert.equal(
    payload.rows[0].image_path,
    "/appdata/abnormal_trend/pic/common/2026-07-17/SDWT-1/ETCH/A/TEMP/10/EQP-1.png",
  )
  assert.equal(payload.rows[0].pass_history, commonRecord)
})

test("자설비와 공통부 SKIP LIST는 3일이 지난 이력을 UI payload에서 제외한다", () => {
  const expiredExecDate = new Date(NOW - PASS_HISTORY_ACTIVE_DURATION_MS).toISOString()
  const baseRecord = {
    line_id: "P1L",
    ver: "V1",
    sdwt: "SDWT-1",
    desc: "ETCH",
    recipe_id: "PPID-1",
    update_date: "2026-07-17",
    priority: "A",
    sensor: "TEMP",
    step: "10",
    eqp: "EQP-1",
    exec_date: expiredExecDate,
  }
  const selfPayload = buildPassHistoryFilterPayload([baseRecord], {
    lineId: "P1L",
    priorities: ["A"],
    desc: "ETCH",
    eqpCh: "ALL",
    sensor: "TEMP",
    chStep: "ALL",
  }, NOW)
  const commonPayload = buildCommonPassHistoryFilterPayload([
    { ...baseRecord, ver: COMMON_PASS_HISTORY_VERSION },
  ], {
    lineId: "P1L",
    prcGroup: "PPID-1",
    eqp: "ALL",
    sensor: "TEMP",
  }, NOW)

  assert.equal(selfPayload.counts.filteredRows, 0)
  assert.equal(commonPayload.counts.filteredRows, 0)
})
