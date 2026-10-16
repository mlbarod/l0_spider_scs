import assert from "node:assert/strict"
import test from "node:test"
import { handleMyEqpEquipmentDataRequest, filterMyEqpRows } from "./myEqpEquipmentData.mjs"
import { normalizeSensorExclusionConfig } from "./sensorExclusionConfig.mjs"

const mapping = { line_mapping: { TEAM_A: "L1", TEAM_B: "L1", TEAM_C: "L2" }, sdwt_mapping: { TEAM_A: "Team A", TEAM_B: "Team B" } }
const row = { sdwt: "Team A", eqp: "EQP01-A.png", recipe_id: "R1", desc: "R1", ver: "V1", sensor: "TEMP", step: "10", priority: "A", status: "ALARM", file_path: "/synthetic/data.parquet" }
const request = { method: "GET", headers: {}, socket: { remoteAddress: "192.0.2.10" } }
const url = new URL("http://spider.test/?line=L1&priority=A&prcGroup=ALL&eqpCh=ALL&sensor=ALL&chStep=ALL&knoxId=forged")
function response() { return { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } } }

test("원본처럼 구분자·대소문자·PNG 확장자를 정규화해 등록한 설비만 매칭한다", () => {
  assert.deepEqual(filterMyEqpRows([row, { ...row, eqp: "EQP02-A.png" }], [{ eqp: "eqp01_a" }]), [row])
})

test("MY EQP는 현재 사용자 활성 등록과 Line별 SDWT 경로만 읽고 SCS 차트 계약을 유지한다", async () => {
  const paths = []
  const res = response()
  await handleMyEqpEquipmentDataRequest(request, res, url, {
    mappingReader: async () => mapping,
    resolveUser: async () => ({ knoxId: "registered.user" }),
    listRegistrations: async payload => {
      assert.deepEqual(payload, { line: "L1", knoxId: "registered.user", activeOnly: true })
      return [{ sdwt: "Team A", eqp: "EQP01_A" }, { sdwt: "TEAM_B", eqp: "EQP02_B" }, { sdwt: "TEAM_C", eqp: "EQP03_C" }]
    },
    readRows: async ({ line, pathSdwt }) => {
      assert.equal(line, "L1")
      paths.push(pathSdwt)
      return { rows: pathSdwt === "TEAM_A" ? [row, { ...row, eqp: "NOT-MINE.png" }, { ...row, sdwt: "Team B" }]
        : [{ ...row, sdwt: "Team B", eqp: "EQP02-B.png" }] }
    },
    readReference: async () => ({ rows: [{ main: "EQP01", sdwt_prod: "Team A", prc_group: "ETCH" }, { main: "EQP02", sdwt_prod: "Team B", prc_group: "ETCH" }] }),
    readExclusions: async () => normalizeSensorExclusionConfig({ version: 1, apps: {} }),
    listPassRecords: async payload => { assert.deepEqual(payload, { lineId: "L1" }); return [] },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(paths.sort(), ["TEAM_A", "TEAM_B"])
  assert.deepEqual(res.body.rows.map(item => item.path_sdwt), ["TEAM_A", "TEAM_B"])
  assert.deepEqual(res.body.rows.map(item => item.sdwt), ["Team A", "Team B"])
  assert.equal(res.body.rows[0].prc_group, "ETCH")
  assert.equal(res.body.rows[0].line_rev, "L1")
  assert.equal(res.body.counts.matchedRegistrationRows, 2)
  assert.deepEqual(res.body.availablePriorities, ["A"])
})

test("등록이 없으면 설비 파일·PASS DB를 읽지 않고 빈 목록을 반환한다", async () => {
  const res = response()
  await handleMyEqpEquipmentDataRequest(request, res, url, {
    mappingReader: async () => mapping, resolveUser: async () => ({ knoxId: "user" }),
    listRegistrations: async () => [], readExclusions: async () => normalizeSensorExclusionConfig({ version: 1, apps: {} }),
    readRows: async () => assert.fail(), readReference: async () => assert.fail(), listPassRecords: async () => assert.fail(),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.rows, [])
  assert.deepEqual(res.body.availablePriorities, [])
})
