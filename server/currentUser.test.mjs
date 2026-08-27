import assert from "node:assert/strict"
import test from "node:test"

import {
  getRemoteIp,
  normalizeRemoteIp,
  resolveCurrentUser,
} from "./currentUser.mjs"

test("forwarded IPv4를 정규화해 이력 knox_id 값으로 사용한다", async () => {
  const req = {
    headers: { "x-forwarded-for": "::ffff:10.20.30.40, 10.20.30.1" },
    socket: { remoteAddress: "127.0.0.1" },
  }

  const remoteIp = getRemoteIp(req)
  assert.equal(remoteIp, "10.20.30.40")
  assert.deepEqual(await resolveCurrentUser(remoteIp), {
    ok: true,
    knoxId: "10.20.30.40",
  })
})

test("IPv6 접속 주소도 그대로 이력 knox_id 값으로 보존한다", async () => {
  const remoteIp = "2001:db8::42"

  assert.equal(normalizeRemoteIp(remoteIp), remoteIp)
  assert.deepEqual(await resolveCurrentUser(remoteIp), {
    ok: true,
    knoxId: remoteIp,
  })
})

test("IP 형식이 아닌 forwarded 값은 접속자 식별값으로 허용하지 않는다", async () => {
  const req = {
    headers: { "x-forwarded-for": "not-an-ip" },
    socket: { remoteAddress: "127.0.0.1" },
  }

  assert.equal(getRemoteIp(req), "")
  await assert.rejects(resolveCurrentUser("not-an-ip"), /접속자 IP/)
})
