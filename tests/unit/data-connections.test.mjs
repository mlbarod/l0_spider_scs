import assert from "node:assert/strict"
import test from "node:test"

import {
  areDataConnectionsEnabled,
  areSelfEquipmentDataConnectionsEnabled,
  blockDisabledDataRequest,
  getDataConnectionCapabilities,
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

test("자설비 파일 연결도 별도 환경변수가 정확히 1일 때만 활성화된다", () => {
  assert.equal(areSelfEquipmentDataConnectionsEnabled({}), false)
  assert.equal(areSelfEquipmentDataConnectionsEnabled({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "true" }), false)
  assert.equal(areSelfEquipmentDataConnectionsEnabled({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "1" }), true)
})

test("mapping capability는 전체 gate에서도 호환되지 않는 Self DB 기능을 fail-close한다", () => {
  assert.deepEqual(getDataConnectionCapabilities({}), {
    selfEquipmentFileRead: false,
    selfEquipmentDb: false,
  })
  assert.deepEqual(getDataConnectionCapabilities({ SCS_SELF_EQUIPMENT_DATA_ENABLED: "1" }), {
    selfEquipmentFileRead: true,
    selfEquipmentDb: false,
  })
  assert.deepEqual(getDataConnectionCapabilities({ SCS_DATA_CONNECTIONS_ENABLED: "1" }), {
    selfEquipmentFileRead: true,
    selfEquipmentDb: false,
  })
})

test("비활성 상태의 API 요청은 handler 실행 전에 503으로 차단된다", () => {
  const response = createResponse()
  const logs = []
  const blocked = blockDisabledDataRequest(
    { method: "GET", url: "/api/dashboard-data", headers: { host: "localhost" } },
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
    "/safe/../api/dashboard-data",
    "/safe/%2e%2e/api/dashboard-data",
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
    { method: "HEAD", url: "/api/dashboard-data", headers: { host: "localhost" } },
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

test("자설비 연결은 필요한 read API만 열고 다른 App과 write API는 계속 차단한다", () => {
  const environment = { SCS_SELF_EQUIPMENT_DATA_ENABLED: "1" }
  for (const pathname of [
    "/api/mapping-config",
    "/api/self-equipment-data",
    "/api/erd-scatter-data",
  ]) {
    assert.equal(blockDisabledDataRequest(
      { method: "GET", url: pathname, headers: { host: "localhost" } },
      createResponse(),
      environment,
    ), false, pathname)
  }

  for (const [method, pathname] of [
    ["GET", "/api/dashboard-data"],
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
