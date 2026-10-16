import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import {
  buildMyEqpRegistrationPayload,
  groupMyEqpRegistrationRecords,
  handleMyEqpRegistrationRequest,
} from "./myEqpRegistration.mjs"

const syntheticMapping = {
  line_mapping: { TEAM_A: "LINE_A" },
  sdwt_mapping: { TEAM_A: "SDWT_A" },
}

function createResponse() {
  return {
    statusCode: null,
    body: "",
    writeHead(statusCode) {
      this.statusCode = statusCode
    },
    end(body = "") {
      this.body = body
    },
  }
}

test("My EQP 등록 요청을 DB 컬럼용 값으로 정규화한다", () => {
  const payload = buildMyEqpRegistrationPayload({
    line: " P1D ",
    sdwt: " DREAMS P1D ",
    prcGroup: " OXIDE ETCH ",
    eqps: ["EQP01_CH_A", " EQP01_CH_A ", "EQP02_CH_B"],
    periode: "15",
    comment: " 점검 대상 ",
  }, " user01 ")

  assert.match(payload.execDate, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  delete payload.execDate

  assert.deepEqual(payload, {
    line: "P1D",
    sdwt: "DREAMS P1D",
    prcGroup: "OXIDE ETCH",
    eqps: ["EQP01_CH_A", "EQP02_CH_B"],
    periode: 15,
    comment: "점검 대상",
    knoxId: "user01",
    knoxIds: ["user01"],
    isPublic: false,
  })
})

test("전체 공개 요청이 포함되어도 신규 My EQP는 지정 사용자 전용으로 저장한다", () => {
  const payload = buildMyEqpRegistrationPayload({
    line: "P1D",
    sdwt: "DREAMS P1D",
    prcGroup: "OXIDE ETCH",
    eqps: ["EQP01_CH_A"],
    periode: 15,
    isPublic: true,
  }, "user01")

  assert.equal(payload.isPublic, false)
})

test("복수 knox_id를 정규화하고 중복 제거한다", () => {
  const payload = buildMyEqpRegistrationPayload({
    line: "P1D",
    sdwt: "DREAMS P1D",
    prcGroup: "OXIDE ETCH",
    eqps: ["EQP01", "EQP02"],
    periode: 7,
    knoxIds: ["user01", " user02@samsung.com ", "user01"],
  }, "owner")

  assert.deepEqual(payload.knoxIds, ["user01", "user02"])
  assert.deepEqual(payload.eqps, ["EQP01", "EQP02"])
})

test("동일 저장 조건의 EQP 행을 하나의 등록 조건으로 묶고 만료를 계산한다", () => {
  const records = ["EQP01_CH_A", "EQP02_CH_B"].map((eqp) => ({
    line: "P1D",
    sdwt: "DREAMS P1D",
    prc_group: "OXIDE ETCH",
    eqp,
    exec_date: "2026-07-18 10:00:00",
    periode: 7,
    comment: "점검 대상",
    knox_id: "user01",
    is_public: 1,
  }))

  const groups = groupMyEqpRegistrationRecords(records, Date.parse("2026-07-20T10:00:00"))

  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].eqps, ["EQP01_CH_A", "EQP02_CH_B"])
  assert.equal(groups[0].expiresAt, "2026-07-25 10:00:00")
  assert.equal(groups[0].active, true)
  assert.equal(groups[0].isPublic, true)

  const expiredGroups = groupMyEqpRegistrationRecords(records, Date.parse("2026-07-25T10:00:00"))
  assert.equal(expiredGroups[0].active, false)
})


test("잘못된 모니터링 기간은 거부한다", () => {
  assert.throws(() => buildMyEqpRegistrationPayload({
    line: "P1D",
    sdwt: "DREAMS P1D",
    prcGroup: "OXIDE ETCH",
    eqps: ["EQP01_CH_A"],
    periode: 0,
  }, "user01"), /positive integer/)
})

test("Comment가 90자를 초과하면 거부한다", () => {
  assert.throws(() => buildMyEqpRegistrationPayload({
    line: "P1D",
    sdwt: "DREAMS P1D",
    prcGroup: "OXIDE ETCH",
    eqps: ["EQP01_CH_A"],
    periode: 15,
    comment: "가".repeat(91),
  }, "user01"), /90 characters/)
})

test("My EQP 등록 API는 GET, POST, DELETE 외 요청을 거부한다", async () => {
  const response = createResponse()

  await handleMyEqpRegistrationRequest({ method: "PUT" }, response)

  assert.equal(response.statusCode, 405)
  assert.equal(JSON.parse(response.body).error, "Method not allowed")
})

test("mapping을 사용할 수 없으면 사용자·My EQP DB 조회 전에 fail-closed한다", async () => {
  const response = createResponse()

  await handleMyEqpRegistrationRequest(
    { method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } },
    response,
    new URL("http://localhost/?line=LINE_A"),
    { mappingReader: async () => { throw new Error("synthetic mapping unavailable") } },
  )

  const payload = JSON.parse(response.body)
  assert.equal(response.statusCode, 503)
  assert.equal(payload.code, "MAPPING_CONFIG_UNAVAILABLE")
})

test("mapping 범위 밖 Line과 SDWT의 My EQP write를 DB 요청 전에 거부한다", async () => {
  const request = Readable.from([JSON.stringify({
    line: "LINE_A",
    sdwt: "UNKNOWN_TEAM",
    prcGroup: "GROUP_A",
    eqps: ["EQP_A"],
    periode: 7,
  })])
  request.method = "POST"
  request.headers = { "content-type": "application/json" }
  request.socket = { remoteAddress: "127.0.0.1" }
  const response = createResponse()

  await handleMyEqpRegistrationRequest(request, response, undefined, {
    mappingReader: async () => syntheticMapping,
    resolveUser: async () => ({ knoxId: "user01" }),
  })

  const payload = JSON.parse(response.body)
  assert.equal(response.statusCode, 400)
  assert.equal(payload.code, "MAPPING_SCOPE_MISMATCH")
})

const registrationInput = { line: "LINE_A", sdwt: "SDWT_A", prcGroup: "ETCH", eqps: ["EQP01_A"], periode: 7, comment: "monitor" }
function request(method, body, headers = {}) {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method, headers: { host: "spider.test", "content-type": "application/json", ...headers }, socket: { remoteAddress: "192.0.2.10" },
  })
}
const dependencies = {
  mappingReader: async () => syntheticMapping,
  resolveUser: async () => ({ knoxId: "owner" }),
  referenceReader: async () => [{ main: "EQP01", disp_name: "A", sdwt_prod: "TEAM_A", prc_group: "ETCH" }],
}

test("표시 SDWT로 등록하고 수신인별 저장하며 삭제는 본인 ID로 고정한다", async () => {
  const calls = []
  const runHelper = async (action, body) => { calls.push({ action, body }); return { ok: true, affectedRows: 1 } }
  let res = createResponse()
  await handleMyEqpRegistrationRequest(request("POST", { ...registrationInput, knoxIds: ["owner", "other"] }), res, null, { ...dependencies, runHelper })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(calls[0].body.knoxIds, ["owner", "other"])
  assert.equal(calls[0].body.sdwt, "SDWT_A")
  res = createResponse()
  await handleMyEqpRegistrationRequest(request("DELETE", { ...registrationInput, execDate: "2026-10-16 10:00:00", knoxId: "other", knoxIds: ["other"] }), res, null, { ...dependencies, runHelper })
  assert.equal(res.statusCode, 200)
  assert.equal(calls[1].body.knoxId, "owner")
  assert.deepEqual(calls[1].body.knoxIds, ["owner"])
})

test("미등록 사용자·외부 사이트·기준정보 외 설비·잘못된 본문은 쓰기 전에 거부한다", async () => {
  const runHelper = async () => assert.fail("must not write")
  for (const [body, headers, status] of [
    [{ ...registrationInput, eqps: ["UNREGISTERED"] }, {}, 400],
    [registrationInput, { origin: "https://other.test" }, 403],
    [registrationInput, { "sec-fetch-site": "cross-site" }, 403],
    [registrationInput, { "content-type": "text/plain" }, 400],
    [null, {}, 400],
  ]) {
    const res = createResponse()
    await handleMyEqpRegistrationRequest(request("POST", body, headers), res, null, { ...dependencies, runHelper })
    assert.equal(res.statusCode, status)
  }
  const res = createResponse()
  await handleMyEqpRegistrationRequest(request("POST", registrationInput), res, null, {
    ...dependencies, runHelper, resolveUser: async () => { throw Object.assign(new Error(), { code: "USER_REGISTRATION_REQUIRED" }) },
  })
  assert.equal(res.statusCode, 428)
})

test("등록 조회는 쿼리의 사용자 ID를 무시하고 활성 등록 조건을 전달한다", async () => {
  const res = createResponse()
  await handleMyEqpRegistrationRequest(request("GET", {}), res, new URL("http://spider.test/?line=LINE_A&knoxId=other&activeOnly=true"), {
    ...dependencies, runHelper: async (action, payload) => {
      assert.equal(action, "list")
      assert.deepEqual(payload, { line: "LINE_A", knoxId: "owner", activeOnly: true })
      return { records: [] }
    },
  })
  assert.equal(res.statusCode, 200)
})
