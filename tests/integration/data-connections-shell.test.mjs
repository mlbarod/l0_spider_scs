import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer as createNetServer } from "node:net"
import { once } from "node:events"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import viteConfig from "../../vite.config.mjs"

const projectRoot = new URL("../../", import.meta.url)

async function findAvailablePort() {
  const server = createNetServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  server.close()
  await once(server, "close")
  return port
}

async function waitForServer(child, timeoutMs = 15_000) {
  let output = ""
  const onData = (chunk) => {
    output += chunk.toString()
  }
  child.stdout.on("data", onData)
  child.stderr.on("data", onData)

  const startedAt = Date.now()
  while (!output.includes("L0 Spider server listening")) {
    if (child.exitCode !== null) throw new Error(`synthetic server exited early (${child.exitCode}): ${output}`)
    if (Date.now() - startedAt > timeoutMs) throw new Error(`synthetic server start timed out: ${output}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([
    once(child, "exit"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("synthetic server stop timed out")), 5_000)),
  ])
}

test("기본 실행은 별도 Self 환경변수 없이 자설비 mapping read를 허용한다", async (context) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "l0-spider-scs-mapping-"))
  const mappingPath = join(temporaryDirectory, "mapping_config.json")
  await writeFile(mappingPath, JSON.stringify({
    line_mapping: { TEAM_A: "LINE_A" },
    sdwt_mapping: {},
  }))
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const port = await findAvailablePort()
  const inheritedEnvironment = { ...process.env }
  delete inheritedEnvironment.SCS_SELF_EQUIPMENT_DATA_ENABLED
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...inheritedEnvironment,
      HOST: "127.0.0.1",
      PORT: String(port),
      LIVE_RELOAD: "1",
      BUILD_ON_START: "0",
      SCS_DATA_CONNECTIONS_ENABLED: "0",
      MAPPING_CONFIG_PATH: mappingPath,
      DB_INFO_PATH: join(temporaryDirectory, "missing-db-info.pkl"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  context.after(() => stopServer(child))

  await waitForServer(child)
  const response = await fetch(`http://127.0.0.1:${port}/api/mapping-config`)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(payload.line_mapping, { TEAM_A: "LINE_A" })
  assert.equal(payload.capabilities.dbConnections, false)
  assert.equal(payload.capabilities.selfEquipmentFileRead, true)
  assert.equal(payload.capabilities.selfEquipmentDb, false)
})

test("명시적 UI shell은 외부 경로·DB helper보다 먼저 API를 차단하고 UI route를 유지한다", async (context) => {
  const port = await findAvailablePort()
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      LIVE_RELOAD: "1",
      BUILD_ON_START: "0",
      SCS_DATA_CONNECTIONS_ENABLED: "0",
      SCS_SELF_EQUIPMENT_DATA_ENABLED: "0",
      SCS_COMMONALITY_DATA_ENABLED: "0",
      SCS_DASHBOARD_DATA_ENABLED: "0",
      SCS_DB_CONNECTIONS_ENABLED: "0",
      SPIDER_DASHBOARD_PATH_ROOT: "/synthetic-path-must-not-be-read",
      DB_INFO_PATH: "/synthetic-db-info-must-not-be-read",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  context.after(() => stopServer(child))

  await waitForServer(child)
  const baseUrl = `http://127.0.0.1:${port}`

  for (const pathname of [
    "/api",
    "/api/dashboard-data",
    "/api/current-user",
    "/api/commonality-data",
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`)
    const payload = await response.json()
    assert.equal(response.status, 503, pathname)
    assert.equal(payload.code, "DATA_CONNECTIONS_DISABLED", pathname)
    assert.match(payload.requestId, /^[0-9a-f-]{36}$/, pathname)
  }

  const headResponse = await fetch(`${baseUrl}/api/dashboard-data`, { method: "HEAD" })
  assert.equal(headResponse.status, 503)
  assert.equal(await headResponse.text(), "")

  const uiResponse = await fetch(`${baseUrl}/self-equipment`)
  assert.equal(uiResponse.status, 200)
  assert.match(await uiResponse.text(), /<html/i)
})

test("Vite 단독 개발 middleware도 API handler보다 먼저 차단한다", () => {
  const plugin = viteConfig.plugins.find(({ name }) => name === "l0-spider-mapping-config-api")
  let middleware
  plugin.configureServer({
    middlewares: {
      use(callback) {
        middleware = callback
      },
    },
  })

  let statusCode = null
  let body = ""
  let nextCalled = false
  middleware(
    { method: "GET", url: "/api/common-commonality-data", headers: { host: "localhost" } },
    {
      writeHead(value) {
        statusCode = value
      },
      end(value = "") {
        body = value
      },
    },
    () => {
      nextCalled = true
    },
  )

  assert.equal(statusCode, 503)
  assert.equal(JSON.parse(body).code, "DATA_CONNECTIONS_DISABLED")
  assert.equal(nextCalled, false)
})
