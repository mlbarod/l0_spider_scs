import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath, URL } from "node:url"
import test from "node:test"

import {
  getRemoteIp,
  normalizeRemoteIp,
  resolveCurrentUser,
} from "./currentUser.mjs"

const compatibilityHelperPath = fileURLToPath(
  new URL("../scripts/current_user.py", import.meta.url),
)
const compatibilityHelperSource = readFileSync(compatibilityHelperPath, "utf8")

function runCompatibilityHelper(remoteIp) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-B", compatibilityHelperPath], {
      env: { ...process.env, REMOTE_ADDR: remoteIp },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `compatibility helper exited with ${code}`))
        return
      }
      resolve(JSON.parse(stdout.trim()))
    })
  })
}

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

test("구버전 Node용 Python helper도 DB 조회 없이 접속 IP를 반환한다", async () => {
  assert.doesNotMatch(
    compatibilityHelperSource,
    /DB_INFO_PATH|pymysql|user_info|v_ipms_ip_info/,
  )
  assert.deepEqual(await runCompatibilityHelper("::ffff:10.20.30.40"), {
    ok: true,
    knoxId: "10.20.30.40",
  })
  assert.deepEqual(await runCompatibilityHelper("not-an-ip"), {
    ok: false,
    code: "IP_NOT_FOUND",
    error: "접속자 IP를 확인하지 못했습니다.",
  })
})
