import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"
import { getRemoteIp, normalizeKnoxId, normalizeRemoteIp, resolveCurrentUser, handleCurrentUserRequest } from "./currentUser.mjs"

function request(method = "GET", body, headers = {}) {
  return Object.assign(Readable.from(body === undefined ? [] : [typeof body === "string" ? body : JSON.stringify(body)]), {
    method, headers: { host: "spider.test", "content-type": "application/json", ...headers },
    socket: { remoteAddress: "192.0.2.10" },
  })
}
function response() {
  return { writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = JSON.parse(body) } }
}
function memoryHelper() {
  const users = new Map()
  return async ({ action, ipAddress, knoxId }) => {
    if (action === "register") {
      if (users.has(ipAddress) && users.get(ipAddress) !== knoxId) throw Object.assign(new Error(), { code: "IP_ALREADY_REGISTERED" })
      users.set(ipAddress, knoxId)
    }
    return { ok: true, ipAddress, knoxId: users.get(ipAddress) ?? null, registrationRequired: !users.has(ipAddress) }
  }
}

test("IP 우선순위·IPv4 mapped 정규화·IPv6와 잘못된 IP를 처리한다", async () => {
  assert.equal(getRemoteIp(request("GET", undefined, { "x-forwarded-for": "::ffff:192.0.2.20, 192.0.2.1" })), "192.0.2.20")
  assert.equal(getRemoteIp(request("GET", undefined, { "x-real-ip": "2001:db8::42" })), "2001:db8::42")
  assert.equal(normalizeRemoteIp("::ffff:192.0.2.10"), "192.0.2.10")
  assert.equal(getRemoteIp(request("GET", undefined, { "x-forwarded-for": "invalid" })), "")
  await assert.rejects(resolveCurrentUser("invalid", () => assert.fail("No DB access")), { code: "IP_NOT_FOUND" })
})

test("최초 조회 → 등록 → 재접속 조회와 서버 IP 고정을 보장한다", async () => {
  const runHelper = memoryHelper()
  let res = response()
  await handleCurrentUserRequest(request(), res, { runHelper })
  assert.equal(res.status, 200)
  assert.equal(res.body.registrationRequired, true)
  assert.equal(res.body.knoxId, null)
  await assert.rejects(resolveCurrentUser("192.0.2.10", runHelper), { code: "USER_REGISTRATION_REQUIRED" })
  res = response()
  await handleCurrentUserRequest(request("POST", { knoxId: " example.user ", ipAddress: "192.0.2.99" }), res, { runHelper })
  assert.equal(res.status, 200)
  assert.equal(res.body.ipAddress, "192.0.2.10")
  assert.equal(res.body.knoxId, "example.user")
  assert.equal(res.body.registrationRequired, false)
  res = response()
  await handleCurrentUserRequest(request(), res, { runHelper })
  assert.equal(res.body.knoxId, "example.user")
  assert.equal(res.headers["Cache-Control"], "no-store")
  assert.equal((await resolveCurrentUser("192.0.2.10", runHelper)).knoxId, "example.user")
})

test("동일 IP·계정 재등록은 성공하고 다른 계정 덮어쓰기는 거절한다", async () => {
  const runHelper = memoryHelper()
  for (const [knoxId, status] of [["user1", 200], ["user1", 200], ["user2", 409]]) {
    const res = response()
    await handleCurrentUserRequest(request("POST", { knoxId }), res, { runHelper })
    assert.equal(res.status, status)
  }
  assert.equal((await resolveCurrentUser("192.0.2.10", runHelper)).knoxId, "user1")
})

test("잘못된 등록 입력과 다른 사이트 요청은 DB 접근 전에 차단한다", async () => {
  const runHelper = () => assert.fail("No DB access")
  for (const [body, headers, status] of [
    [{ knoxId: "" }, {}, 400], [{ knoxId: "a@b.com" }, {}, 400],
    [{ knoxId: 123 }, {}, 400], [{ knoxId: "a".repeat(129) }, {}, 400],
    [null, {}, 400], ["{", {}, 400], ["a".repeat(4097), {}, 413],
    [{ knoxId: "user" }, { "content-type": "text/plain" }, 400],
    [{ knoxId: "user" }, { origin: "https://other.test" }, 403],
    [{ knoxId: "user" }, { origin: "null" }, 403],
    [{ knoxId: "user" }, { "sec-fetch-site": "cross-site" }, 403],
  ]) {
    const res = response()
    await handleCurrentUserRequest(request("POST", body, headers), res, { runHelper })
    assert.equal(res.status, status)
  }
  assert.equal(normalizeKnoxId(" Mixed.User_01- "), "Mixed.User_01-")
  assert.equal(normalizeKnoxId("a".repeat(128)).length, 128)
})

test("같은 사이트 JSON 등록과 IPv6 요청을 허용한다", async () => {
  const res = response()
  await handleCurrentUserRequest(request("POST", { knoxId: "user" }, {
    origin: "https://spider.test", "x-forwarded-for": "2001:db8::42", "content-type": "application/json; charset=utf-8",
  }), res, { runHelper: memoryHelper() })
  assert.equal(res.status, 200)
  assert.equal(res.body.ipAddress, "2001:db8::42")
})

test("DB 장애는 미등록이나 IP 계정으로 취급하지 않고 내부 정보를 숨긴다", async () => {
  for (const method of ["GET", "POST"]) {
    const res = response()
    await handleCurrentUserRequest(request(method, { knoxId: "user" }), res, {
      runHelper: async () => { throw new Error("synthetic secret database details") },
    })
    assert.equal(res.status, 503)
    assert.equal(res.body.code, "CURRENT_USER_DB_FAILED")
    assert.doesNotMatch(JSON.stringify(res.body), /synthetic secret/)
  }
  const res = response()
  await handleCurrentUserRequest(request("DELETE"), res)
  assert.equal(res.status, 405)
})
