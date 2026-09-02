import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { handleDashboardLatestDateRequest } from "../../server/dashboardData.mjs"

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

test("최신 시각 API는 전체 집계 없이 path 세부파일의 최신 이름만 반환한다", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "l0-spider-dashboard-latest-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await Promise.all([
    writeFile(join(directory, "2026-08-26 09:00:00"), "not-read"),
    writeFile(join(directory, "2026-08-27 14:25:30"), "not-read"),
    writeFile(join(directory, "invalid-file-name"), "not-read"),
  ])

  const response = createResponse()
  await handleDashboardLatestDateRequest({ method: "GET" }, response, directory)

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers["Cache-Control"], "no-store")
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    latestDate: "2026-08-27 14:25:30",
  })
})

test("최신 시각 API는 유효한 세부파일이 없으면 안전한 404를 반환한다", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "l0-spider-dashboard-empty-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, "invalid-file-name"), "not-read")

  const response = createResponse()
  await handleDashboardLatestDateRequest({ method: "GET" }, response, directory)
  const payload = JSON.parse(response.body)

  assert.equal(response.statusCode, 404)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, "DASHBOARD_LATEST_DATE_NOT_FOUND")
  assert.equal(payload.error, "Unable to find the latest dashboard data date.")
})
