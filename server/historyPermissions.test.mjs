import assert from "node:assert/strict"
import test from "node:test"
import { Readable } from "node:stream"
import { isMasterUser } from "./masterPermissions.mjs"
import { handleCurrentUserRequest } from "./currentUser.mjs"
import { handleHitHistoryRequest } from "./hitHistory.mjs"

const recordId = "a".repeat(64)
function request(body = { recordId }, headers = {}, method = "DELETE") {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method, headers: { host: "spider.test", "content-type": "application/json", ...headers },
    socket: { remoteAddress: "192.0.2.10" },
  })
}
function response() {
  return { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
}
function setMasters(context) {
  const previous = process.env.SPIDER_MASTER_KNOX_IDS
  process.env.SPIDER_MASTER_KNOX_IDS = " master.one,master.two, , "
  context.after(() => {
    if (previous === undefined) delete process.env.SPIDER_MASTER_KNOX_IDS
    else process.env.SPIDER_MASTER_KNOX_IDS = previous
  })
}

test("마스터 목록은 공백·빈 항목을 무시하고 정확한 ID만 허용한다", context => {
  setMasters(context)
  assert.equal(isMasterUser("master.one"), true)
  assert.equal(isMasterUser("master.two"), true)
  for (const id of ["master", "Master.one", "", null, "master.one,master.two"]) assert.equal(isMasterUser(id), false)
  delete process.env.SPIDER_MASTER_KNOX_IDS
  assert.equal(isMasterUser("master.one"), false)
})

test("삭제는 서버 조회 마스터만 허용하며 위조 ID와 외부 사이트 요청을 차단한다", async context => {
  setMasters(context)
  const calls = []
  const runHelper = async payload => { calls.push(payload); return { ok: true, affectedRows: 1 } }
  let res = response()
  await handleHitHistoryRequest(request({ recordId, knoxId: "master.one", canDeleteHistory: true }), res, {
    runHelper, resolveUser: async () => ({ knoxId: "normal.user" }),
  })
  assert.equal(res.status, 403)
  assert.equal(calls.length, 0)
  for (const headers of [{ origin: "https://other.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }]) {
    res = response()
    await handleHitHistoryRequest(request({ recordId }, headers), res, {
      runHelper, resolveUser: async () => { throw new Error("must not resolve user") },
    })
    assert.equal(res.status, 403)
  }
  res = response()
  await handleHitHistoryRequest(request({ recordId, knoxId: "normal.user", action: "list" }, { origin: "https://spider.test" }), res, {
    runHelper, resolveUser: async ip => { assert.equal(ip, "192.0.2.10"); return { knoxId: "master.one" } },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(calls, [{ action: "delete", recordId }])
})

test("삭제는 미등록·조회 장애·잘못된 본문·미존재 게시물을 처리한다", async context => {
  setMasters(context)
  for (const [code, status] of [["USER_REGISTRATION_REQUIRED", 428], ["CURRENT_USER_DB_FAILED", 503]]) {
    const res = response()
    await handleHitHistoryRequest(request(), res, {
      resolveUser: async () => { throw Object.assign(new Error(), { code }) },
      runHelper: async () => assert.fail("must not delete"),
    })
    assert.equal(res.status, status)
  }
  for (const [body, headers, status] of [[{}, {}, 400], [{ recordId: "bad" }, {}, 400], [{ recordId, extra: "x".repeat(4096) }, {}, 413], [{ recordId }, { "content-type": "text/plain" }, 400]]) {
    const res = response()
    await handleHitHistoryRequest(request(body, headers), res, {
      resolveUser: async () => ({ knoxId: "master.one" }), runHelper: async () => assert.fail("must not delete"),
    })
    assert.equal(res.status, status)
  }
  const res = response()
  await handleHitHistoryRequest(request(), res, {
    resolveUser: async () => ({ knoxId: "master.one" }),
    runHelper: async () => { throw Object.assign(new Error(), { code: "HISTORY_NOT_FOUND" }) },
  })
  assert.equal(res.status, 404)
})

test("마스터 응답 권한과 새 IP에서 마스터 ID 최초 등록 차단", async context => {
  setMasters(context)
  for (const id of [null, "normal.user", "master.one"]) {
    const calls = []
    const runHelper = async payload => { calls.push(payload.action); return { ok: true, knoxId: id, registrationRequired: !id } }
    let res = response()
    await handleCurrentUserRequest(request({}, {}, "GET"), res, { runHelper })
    assert.equal(res.body.canDeleteHistory, id === "master.one")
    calls.length = 0
    res = response()
    await handleCurrentUserRequest(request({ knoxId: "master.one" }, {}, "POST"), res, { runHelper })
    assert.equal(res.status, id === "master.one" ? 200 : 403)
    assert.deepEqual(calls, id === "master.one" ? ["lookup", "register"] : ["lookup"])
  }
})
