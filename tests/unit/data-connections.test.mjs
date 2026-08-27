import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  areDashboardDataConnectionsEnabled,
  areDataConnectionsEnabled,
  areDbConnectionsEnabled,
  areSelfEquipmentDataConnectionsEnabled,
  blockDisabledDataRequest,
  getDataConnectionCapabilities,
  isDbInfoReadable,
  resolveDbInfoPath,
} from "../../server/dataConnections.mjs"

function createResponse() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = "") {
      this.body = body
    },
  }
}

test("SCS 데이터 연결은 명시적으로 1을 설정하기 전까지 비활성화된다", () => {
  assert.equal(areDataConnectionsEnabled({}), false)
  assert.equal(areDataConnectionsEnabled({ SCS_DATA_CONNECTIONS_ENABLED: "0" }), false)
  assert.equal(areDataConnectionsEnabled({ SCS_DATA_CONNECTIONS_ENABLED: "true" }), false)
  assert.equal(areDataConnectionsEnabled({ SCS_DATA_CONNECTIONS_ENABLED: "1" }), true)
})

test("자설비 파일 연결은 기본 활성화되고 명시적인 비-1 값으로 차단할 수 있다", () => {
  assert.equal(areSelfEquipmentDataConnectionsEnabled({}), true)
  assert.equal(areSelfEquipmentDataConnectionsEnabled({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "0" }), false)
  assert.equal(areSelfEquipmentDataConnectionsEnabled({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "true" }), false)
  assert.equal(areSelfEquipmentDataConnectionsEnabled({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "1" }), true)
})

test("Dashboard read는 기본 활성화되고 명시적인 비-1 값으로 차단할 수 있다", () => {
  assert.equal(areDashboardDataConnectionsEnabled({}), true)
  assert.equal(areDashboardDataConnectionsEnabled({ SCS_DASHBOARD_DATA_ENABLED: "0" }), false)
  assert.equal(areDashboardDataConnectionsEnabled({ SCS_DASHBOARD_DATA_ENABLED: "true" }), false)
  assert.equal(areDashboardDataConnectionsEnabled({ SCS_DASHBOARD_DATA_ENABLED: "1" }), true)
})

test("DB 연결은 credential 파일이 읽기 가능할 때만 활성화된다", () => {
  assert.equal(resolveDbInfoPath({}), "/appdata/l0_spider_scs/db_info.pkl")
  assert.equal(resolveDbInfoPath({ DB_INFO_PATH: " /secure/db_info.pkl " }), "/secure/db_info.pkl")
  assert.equal(areDbConnectionsEnabled({}, () => false), false)
  assert.equal(areDbConnectionsEnabled({}, () => true), true)
  assert.equal(areDbConnectionsEnabled({ SCS_DB_CONNECTIONS_ENABLED: "0" }, () => true), false)
  assert.equal(areDbConnectionsEnabled({ SCS_DB_CONNECTIONS_ENABLED: "1" }, () => true), true)
})

test("모든 DB Python helper는 SCS 기본 credential 경로를 공유한다", () => {
  const helperNames = [
    "current_user.py",
    "hit_history.py",
    "clicked_category_history.py",
    "pass_history.py",
    "my_eqp_reference.py",
    "my_eqp_registration.py",
    "mailing_registration.py",
  ]

  for (const helperName of helperNames) {
    const source = readFileSync(new URL(`../../scripts/${helperName}`, import.meta.url), "utf8")
    assert.match(
      source,
      /os\.environ\.get\("DB_INFO_PATH"\) or "\/appdata\/l0_spider_scs\/db_info\.pkl"/,
      helperName,
    )
  }
})

test("DB credential read 가능 여부는 파일 내용을 노출하지 않고 판정한다", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "l0-spider-db-info-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const credentialPath = join(directory, "db_info.pkl")
  await writeFile(credentialPath, "synthetic-placeholder", { mode: 0o600 })

  assert.equal(isDbInfoReadable(credentialPath), true)
  assert.equal(isDbInfoReadable(directory), false)
  assert.equal(isDbInfoReadable(join(directory, "missing.pkl")), false)
})

test("mapping capability는 DB 연결과 호환되지 않는 Self DB 작업을 구분한다", () => {
  assert.deepEqual(getDataConnectionCapabilities({}, () => false), {
    dbConnections: false,
    selfEquipmentFileRead: true,
    selfEquipmentDb: false,
  })
  assert.deepEqual(getDataConnectionCapabilities({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "1" }, () => true), {
    dbConnections: true,
    selfEquipmentFileRead: true,
    selfEquipmentDb: false,
  })
  assert.deepEqual(getDataConnectionCapabilities({ SCS_DATA_CONNECTIONS_ENABLED: "1" }, () => true), {
    dbConnections: true,
    selfEquipmentFileRead: true,
    selfEquipmentDb: false,
  })
})

test("비허용 API 요청은 handler 실행 전에 503으로 차단된다", () => {
  const response = createResponse()
  const logs = []
  const blocked = blockDisabledDataRequest(
    { method: "GET", url: "/api/commonality-data", headers: { host: "localhost" } },
    response,
    {},
    (message) => logs.push(message),
  )

  assert.equal(blocked, true)
  assert.equal(response.statusCode, 503)
  assert.equal(response.headers["Cache-Control"], "no-store")
  const payload = JSON.parse(response.body)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, "DATA_CONNECTIONS_DISABLED")
  assert.equal(payload.error, "SCS ETCH SPIDER 데이터 연결을 준비 중입니다.")
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(logs.length, 1)
})

test("API root와 encoded separator도 같은 차단 경계로 처리한다", () => {
  for (const requestUrl of [
    "/api",
    "/api?check=1",
    "/api/",
    "/api//dashboard-data",
    "/api%2Fdashboard-data",
    "/api%5Cdashboard-data",
    "/safe/../api/commonality-data",
    "/safe/%2e%2e/api/commonality-data",
  ]) {
    const response = createResponse()
    assert.equal(blockDisabledDataRequest(
      { method: "GET", url: requestUrl, headers: { host: "localhost" } },
      response,
      {},
      () => {},
    ), true, requestUrl)
    assert.equal(response.statusCode, 503, requestUrl)
  }
})

test("요청 Host가 비정상이어도 고정 origin으로 API 경계를 판정한다", () => {
  const response = createResponse()
  assert.equal(blockDisabledDataRequest(
    { method: "GET", url: "/api/current-user", headers: { host: "[invalid" } },
    response,
    {},
    () => {},
  ), true)
  assert.equal(response.statusCode, 503)
})

test("HEAD 요청은 동일한 503 header를 반환하되 body를 보내지 않는다", () => {
  const response = createResponse()
  assert.equal(blockDisabledDataRequest(
    { method: "HEAD", url: "/api/commonality-data", headers: { host: "localhost" } },
    response,
    {},
    () => {},
  ), true)
  assert.equal(response.statusCode, 503)
  assert.equal(response.body, "")
})

test("정적 UI 요청과 명시적으로 활성화한 API 요청은 기존 흐름으로 전달된다", () => {
  const staticResponse = createResponse()
  const enabledResponse = createResponse()

  assert.equal(blockDisabledDataRequest(
    { method: "GET", url: "/self-equipment", headers: { host: "localhost" } },
    staticResponse,
    {},
  ), false)
  assert.equal(blockDisabledDataRequest(
    { method: "GET", url: "/api/dashboard-data", headers: { host: "localhost" } },
    enabledResponse,
    { SCS_DATA_CONNECTIONS_ENABLED: "1" },
  ), false)
  assert.equal(staticResponse.statusCode, null)
  assert.equal(enabledResponse.statusCode, null)
})

test("기본 실행은 Dashboard와 자설비 read API를 열고 다른 App은 계속 차단한다", () => {
  const environment = {}
  for (const [method, pathname] of [
    ["GET", "/api/dashboard-data"],
    ["HEAD", "/api/dashboard-data"],
    ["GET", "/api/dashboard-latest-date"],
    ["HEAD", "/api/dashboard-latest-date"],
    ["GET", "/api/mapping-config"],
    ["GET", "/api/self-equipment-data"],
    ["GET", "/api/erd-scatter-data"],
  ]) {
    assert.equal(blockDisabledDataRequest(
      { method, url: pathname, headers: { host: "localhost" } },
      createResponse(),
      environment,
    ), false, pathname)
  }

  for (const [method, pathname] of [
    ["POST", "/api/dashboard-data"],
    ["POST", "/api/dashboard-latest-date"],
    ["GET", "/api/commonality-data"],
    ["GET", "/api/erd-file"],
    ["GET", "/api%2Fself-equipment-data"],
    ["HEAD", "/api/self-equipment-data"],
    ["HEAD", "/api/erd-scatter-data"],
    ["POST", "/api/pass-history"],
    ["POST", "/api/hit-history"],
  ]) {
    const response = createResponse()
    assert.equal(blockDisabledDataRequest(
      { method, url: pathname, headers: { host: "localhost" } },
      response,
      environment,
      () => {},
    ), true, `${method} ${pathname}`)
    assert.equal(response.statusCode, 503)
  }
})

test("읽기 가능한 credential이 있으면 DB API만 열고 Self DB 혼합 API는 유지 차단한다", () => {
  const environment = { DB_INFO_PATH: "/synthetic/db_info.pkl" }
  for (const [method, pathname] of [
    ["GET", "/api/current-user"],
    ["POST", "/api/hit-history"],
    ["POST", "/api/clicked-category-history"],
    ["GET", "/api/pass-history"],
    ["POST", "/api/pass-history"],
    ["DELETE", "/api/pass-history"],
    ["HEAD", "/api/my-eqp-reference"],
    ["POST", "/api/my-eqp-registration"],
    ["DELETE", "/api/mailing-registration"],
  ]) {
    assert.equal(blockDisabledDataRequest(
      { method, url: pathname, headers: { host: "localhost" } },
      createResponse(),
      environment,
      () => {},
      () => true,
    ), false, `${method} ${pathname}`)
  }

  const response = createResponse()
  assert.equal(blockDisabledDataRequest(
    { method: "GET", url: "/api/my-eqp-equipment-data", headers: { host: "localhost" } },
    response,
    environment,
    () => {},
    () => true,
  ), true)
  assert.equal(response.statusCode, 503)
})

test("자설비 read API는 환경변수 0으로 명시적으로 차단할 수 있다", () => {
  for (const pathname of [
    "/api/mapping-config",
    "/api/self-equipment-data",
    "/api/erd-scatter-data",
  ]) {
    const response = createResponse()
    assert.equal(blockDisabledDataRequest(
      { method: "GET", url: pathname, headers: { host: "localhost" } },
      response,
      { SCS_SELF_EQUIPMENT_DATA_ENABLED: "0" },
      () => {},
    ), true, pathname)
    assert.equal(response.statusCode, 503, pathname)
  }
})
