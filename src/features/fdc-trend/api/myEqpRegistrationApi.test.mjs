import assert from "node:assert/strict"
import test from "node:test"

import { createMyEqpRegistration } from "./myEqpRegistrationApi.js"

test("My EQP 등록 요청은 브라우저 사용자 식별값을 보내지 않는다", async (context) => {
  const originalFetch = globalThis.fetch
  let requestBody = null
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return {
      ok: true,
      json: async () => ({ ok: true, requestedRows: 1 }),
    }
  }
  context.after(() => { globalThis.fetch = originalFetch })

  await createMyEqpRegistration({
    line: "LINE_A",
    sdwt: "TEAM_A",
    prcGroup: "GROUP_A",
    eqps: ["EQP_A"],
    periode: 7,
    comment: "synthetic",
    knoxIds: ["browser-value-must-not-be-sent"],
  })

  assert.deepEqual(requestBody, {
    line: "LINE_A",
    sdwt: "TEAM_A",
    prcGroup: "GROUP_A",
    eqps: ["EQP_A"],
    periode: 7,
    comment: "synthetic",
  })
})
