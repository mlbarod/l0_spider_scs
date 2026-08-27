import assert from "node:assert/strict"
import test from "node:test"

import {
  buildErdDataReferencePath,
  fetchEqpAllSkipTargets,
  fetchErdIdentityData,
  fetchErdScatterData,
  getSelfEquipmentPassHistoryFields,
  getSelfEquipmentHistoryFilePath,
  getSelfEquipmentHistoryFilePaths,
  isSelfEquipmentHistoryActionAvailable,
} from "./selfEquipmentApi.js"

test("자설비 EQP png 경로를 실제 data.parquet 참조 경로로 변환한다", () => {
  assert.equal(
    buildErdDataReferencePath(
      "/appdata/abnormal_trend/pic_server2/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/EQP-1.png",
    ),
    "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/data.parquet",
  )
})

test("자설비 이력 action은 DB capability가 아니라 chart file_path로 활성화한다", () => {
  assert.equal(isSelfEquipmentHistoryActionAvailable({
    file_path: "/appdata/abnormal_trend/pic/erd/chart.png",
  }), true)
  assert.equal(isSelfEquipmentHistoryActionAvailable({ file_path: "" }), false)
  assert.equal(isSelfEquipmentHistoryActionAvailable({}), false)
})

test("자설비 directory와 data.parquet 경로 형식을 모두 호환한다", () => {
  assert.equal(
    buildErdDataReferencePath("/appdata/abnormal_trend/pic/erd/2026-08-25/result"),
    "/appdata/abnormal_trend/pic/erd/2026-08-25/result/data.parquet",
  )
  assert.equal(
    buildErdDataReferencePath("/appdata/abnormal_trend/pic/erd/2026-08-25/result/data.parquet"),
    "/appdata/abnormal_trend/pic/erd/2026-08-25/result/data.parquet",
  )
  assert.equal(buildErdDataReferencePath(""), "")
})

test("클릭이력·이력저장·SKIP은 path_xian 원본 file_path를 공통 사용한다", () => {
  assert.equal(getSelfEquipmentHistoryFilePath({
    file_path: "/appdata/abnormal_trend/pic/erd/chart.png",
    history_file_path: "",
  }), "/appdata/abnormal_trend/pic/erd/chart.png")
  assert.equal(getSelfEquipmentHistoryFilePath({ history_file_path: "/legacy/chart.png" }), "")
  assert.deepEqual(getSelfEquipmentHistoryFilePaths([
    { file_path: "/appdata/abnormal_trend/pic/erd/chart-a.png" },
    { file_path: "/appdata/abnormal_trend/pic/erd/chart-a.png" },
    { file_path: "/appdata/abnormal_trend/pic/erd/chart-b.png" },
  ]), [
    "/appdata/abnormal_trend/pic/erd/chart-a.png",
    "/appdata/abnormal_trend/pic/erd/chart-b.png",
  ])
})

test("자설비 SKIP은 path_xian row에서 PASS 이력 필드를 구성한다", () => {
  assert.deepEqual(getSelfEquipmentPassHistoryFields({
    latest_date: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    ver: "V1",
    recipe_id: "RECIPE-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1.png",
  }), {
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    ver: "V1",
    recipeId: "RECIPE-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
  })
})

test("단일설비와 동일성 차트 요청은 선택한 ERD row의 ver를 전달한다", async (t) => {
  const originalFetch = globalThis.fetch
  const requestedUrls = []
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    return { ok: true, json: async () => ({ ok: true }) }
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  await fetchErdScatterData({
    filePath: "/appdata/abnormal_trend/pic/erd/chart.png",
    eqp: "EQP-1",
    sensor: "TEMP",
    chStep: "10@MAIN",
    ver: "V7",
    line: "LINE-1",
    pathSdwt: "SDWT-1",
  })

  await fetchErdIdentityData({
    filePath: "/appdata/abnormal_trend/pic/erd/chart.png",
    eqp: "EQP-1",
    sensor: "TEMP",
    chStep: "10@MAIN",
    ver: "V7",
    line: "LINE-1",
    pathSdwt: "SDWT-1",
  })

  assert.equal(requestedUrls.length, 2)
  requestedUrls.forEach((url) => assert.match(url, /(?:\?|&)ver=V7(?:&|$)/))
})

test("자설비 EQP ALL SKIP 대상은 일반 자설비 API로 조회한다", async (t) => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return {
      ok: true,
      json: async () => ({
        rows: [{
          file_path: "/appdata/erd/chart.png",
          latest_date: "2026-08-27 13:00:00",
          sdwt: "SDWT-1",
          desc: "RECIPE-1",
          ver: "V1",
          recipe_id: "RECIPE-1",
          priority: "A",
          sensor: "SENSOR-1",
          step: "10@MAIN",
          eqp: "EQP-1.png",
        }],
      }),
    }
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const targets = await fetchEqpAllSkipTargets({
    line: "LINE-1",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    priorities: ["A"],
    desc: "STEP-1",
    eqpCh: "EQP-1",
    sensor: "SENSOR-1",
  })

  assert.match(requestedUrl, /^\/api\/self-equipment-data\?/)
  assert.match(requestedUrl, /pathSdwt=SDWT-1/)
  assert.match(requestedUrl, /sensor=SENSOR-1/)
  assert.match(requestedUrl, /chStep=ALL/)
  assert.deepEqual(targets, [{
    filePath: "/appdata/erd/chart.png",
    updateDate: "2026-08-27 13:00:00",
    sdwt: "SDWT-1",
    desc: "RECIPE-1",
    ver: "V1",
    recipeId: "RECIPE-1",
    priority: "A",
    sensor: "SENSOR-1",
    step: "10@MAIN",
    eqp: "EQP-1",
  }])
})

test("EQP ALL SKIP 대상 조회는 sensor ALL을 허용하지 않는다", async (t) => {
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error("호출되면 안 됩니다.")
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  await assert.rejects(
    () => fetchEqpAllSkipTargets({
      line: "LINE-1",
      pathSdwt: "SDWT-1",
      sdwt: "SDWT-1",
      priorities: ["A"],
      desc: "STEP-1",
      eqpCh: "EQP-1",
      sensor: "ALL",
    }),
    /개별 sensor/,
  )
  assert.equal(fetchCalled, false)
})
