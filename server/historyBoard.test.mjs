import assert from "node:assert/strict"
import test from "node:test"
import { Readable } from "node:stream"

import { handleHistoryBoardRequest } from "./historyBoard.mjs"

const postId = "b".repeat(64)
const requestId = "00000000-0000-4000-8000-000000000001"
// Smallest PNG shape accepted by the existing snapshot validation (IHDR + IEND).
const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.from("0000000d49484452", "hex"), Buffer.from("00000001000000010806000000", "hex"), Buffer.alloc(4),
  Buffer.from("0000000049454e44ae426082", "hex"),
])
const image = `data:image/png;base64,${png.toString("base64")}`
const historyBody = {
  entryType: "HISTORY", title: "[SPIDER] title", details: "Line: P1L", comment: "Please review the anomaly detection details.",
  app: "self-equipment", lineId: "P1L", updateDate: "2026-08-27 13:00:00", sdwt: "SDWT-1",
  filePath: "/appdata/result/chart.png", image, requestId,
}

function request({ method = "GET", url = "/api/history-board", body, headers = {} } = {}) {
  return Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), {
    method, url, headers: { host: "spider.test", "content-type": "application/json", ...headers },
    socket: { remoteAddress: "192.0.2.10" },
  })
}
function response() {
  return {
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.raw = body; try { this.body = JSON.parse(body) } catch { this.body = undefined } },
  }
}
function setup(knoxId = "user.one") {
  const calls = []
  const options = {
    resolveUser: async () => ({ knoxId }),
    runHelper: async (payload) => {
      calls.push(payload)
      if (payload.action === "create") return { ok: true, id: payload.id, created: true }
      if (payload.action === "detail") return { ok: true, post: { id: payload.id } }
      if (payload.action === "image") return { ok: true, imageBase64: png.toString("base64") }
      return { ok: true, posts: [], total: 0 }
    },
  }
  return { calls, options }
}

test("이력저장 등록은 메일을 보내지 않고 게시판 create 요청으로 저장한다", async () => {
  const { calls, options } = setup()
  const res = response()
  await handleHistoryBoardRequest(request({ method: "POST", body: historyBody }), res, options)
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  const [call] = calls
  assert.equal(call.action, "create")
  assert.equal(call.entryType, "HISTORY")
  assert.equal(call.actor, "user.one")
  assert.equal(call.comment, historyBody.comment)
  assert.equal(call.filePath, "#appdata#result#chart.png")
  assert.equal(call.imageBase64, png.toString("base64"))
  assert.match(call.id, /^[a-f0-9]{64}$/)
  assert.equal(res.body.id, call.id)
})

test("같은 요청 ID 재시도는 같은 게시글 ID와 fingerprint를 사용한다", async () => {
  const { calls, options } = setup()
  await handleHistoryBoardRequest(request({ method: "POST", body: historyBody }), response(), options)
  await handleHistoryBoardRequest(request({ method: "POST", body: historyBody }), response(), options)
  assert.equal(calls[0].id, calls[1].id)
  assert.equal(calls[0].fingerprint, calls[1].fingerprint)
})


test("잘못된 등록 요청은 DB helper를 호출하지 않고 400을 반환한다", async () => {
  for (const body of [
    { ...historyBody, entryType: "SEND" },
    { ...historyBody, entryType: "MAIL" },
    { ...historyBody, comment: undefined },
    { ...historyBody, comment: "  " },
    { ...historyBody, title: "a\nb" },
    { ...historyBody, app: "unknown" },
    { ...historyBody, image: undefined },
    { ...historyBody, requestId: "bad" },
  ]) {
    const { calls, options } = setup()
    const res = response()
    await handleHistoryBoardRequest(request({ method: "POST", body }), res, options)
    assert.equal(res.status, 400)
    assert.equal(calls.length, 0)
  }
})

test("외부 사이트의 변경 요청은 차단한다", async () => {
  const { calls, options } = setup()
  const res = response()
  await handleHistoryBoardRequest(request({ method: "POST", body: historyBody, headers: { origin: "https://evil.test" } }), res, options)
  assert.equal(res.status, 403)
  assert.equal(calls.length, 0)
})

test("목록 조회는 필터를 검증해 전달한다", async () => {
  const { calls, options } = setup()
  let res = response()
  await handleHistoryBoardRequest(request({ url: "/api/history-board?page=2&status=COMPLETED&search=%20eqp%20&line=P1L&sdwt=S1" }), res, options)
  assert.equal(res.status, 200)
  assert.deepEqual(calls[0], { action: "list", page: 2, status: "COMPLETED", search: "eqp", line: "P1L", sdwt: "S1" })
  res = response()
  await handleHistoryBoardRequest(request({ url: "/api/history-board?status=DELETED" }), res, options)
  assert.equal(res.status, 400)
})

test("상태 변경은 상태·version·코멘트만 전달한다", async () => {
  const { calls, options } = setup()
  const res = response()
  await handleHistoryBoardRequest(request({ method: "PATCH", url: `/api/history-board/${postId}`, body: { status: "COMPLETED", version: 3, comment: " done " } }), res, options)
  assert.equal(res.status, 200)
  assert.deepEqual(calls[0], { action: "status", actor: "user.one", id: postId, status: "COMPLETED", version: 3, comment: "done" })
})

test("삭제는 마스터 사용자만 가능하고 상세 응답에 삭제 권한을 표시한다", async (context) => {
  const previous = process.env.SPIDER_MASTER_KNOX_IDS
  process.env.SPIDER_MASTER_KNOX_IDS = "master.one"
  context.after(() => {
    if (previous === undefined) delete process.env.SPIDER_MASTER_KNOX_IDS
    else process.env.SPIDER_MASTER_KNOX_IDS = previous
  })
  let { calls, options } = setup("user.one")
  let res = response()
  await handleHistoryBoardRequest(request({ method: "DELETE", url: `/api/history-board/${postId}` }), res, options)
  assert.equal(res.status, 403)
  assert.equal(calls.length, 0)
  res = response()
  await handleHistoryBoardRequest(request({ url: `/api/history-board/${postId}` }), res, options)
  assert.equal(res.body.post.canDelete, false)

  ;({ calls, options } = setup("master.one"))
  res = response()
  await handleHistoryBoardRequest(request({ method: "DELETE", url: `/api/history-board/${postId}` }), res, options)
  assert.equal(res.status, 200)
  assert.deepEqual(calls[0], { action: "delete", actor: "master.one", id: postId })
})

test("이미지 조회는 PNG를 안전한 헤더로 반환한다", async () => {
  const { options } = setup()
  const res = response()
  await handleHistoryBoardRequest(request({ url: `/api/history-board/${postId}/image` }), res, options)
  assert.equal(res.status, 200)
  assert.equal(res.headers["Content-Type"], "image/png")
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff")
  assert.deepEqual(res.raw, png)
})

test("DB helper 오류 코드는 안전한 메시지로 변환한다", async () => {
  const res = response()
  await handleHistoryBoardRequest(request({ url: `/api/history-board/${postId}` }), res, {
    resolveUser: async () => ({ knoxId: "user.one" }),
    runHelper: async () => { throw Object.assign(new Error("x"), { code: "BOARD_NOT_FOUND" }) },
  })
  assert.equal(res.status, 404)
  assert.equal(res.body.error, "The board entry was not found.")
  const failed = response()
  await handleHistoryBoardRequest(request({ url: `/api/history-board/${postId}` }), failed, {
    resolveUser: async () => ({ knoxId: "user.one" }),
    runHelper: async () => { throw new Error("db password leaked") },
  })
  assert.equal(failed.status, 500)
  assert.doesNotMatch(JSON.stringify(failed.body), /password/)
})

test("사용자 등록을 하지 않아도 목록·상세·이미지는 조회할 수 있고, 변경 요청은 차단한다", async () => {
  const calls = []
  const options = {
    resolveUser: async () => { throw Object.assign(new Error("x"), { code: "USER_REGISTRATION_REQUIRED" }) },
    runHelper: async (payload) => {
      calls.push(payload)
      if (payload.action === "detail") return { ok: true, post: { id: payload.id } }
      if (payload.action === "image") return { ok: true, imageBase64: png.toString("base64") }
      return { ok: true, posts: [], total: 0 }
    },
  }
  for (const url of ["/api/history-board", `/api/history-board/${postId}`, `/api/history-board/${postId}/image`]) {
    const res = response()
    await handleHistoryBoardRequest(request({ url }), res, options)
    assert.equal(res.status, 200, url)
  }
  assert.deepEqual(calls.map((call) => [call.action, call.actor]), [["list", undefined], ["detail", undefined], ["image", undefined]])

  const detail = response()
  await handleHistoryBoardRequest(request({ url: `/api/history-board/${postId}` }), detail, options)
  assert.equal(detail.body.post.canDelete, false)

  calls.length = 0
  for (const [method, url, body] of [
    ["POST", "/api/history-board", historyBody],
    ["PATCH", `/api/history-board/${postId}`, { status: "COMPLETED", version: 1 }],
    ["DELETE", `/api/history-board/${postId}`, undefined],
  ]) {
    const res = response()
    await handleHistoryBoardRequest(request({ method, url, body }), res, options)
    assert.equal(res.status, 428, method)
  }
  assert.equal(calls.length, 0)
})
