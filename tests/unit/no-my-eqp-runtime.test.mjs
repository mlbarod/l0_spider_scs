import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const RUNTIME_FILES = [
  "server.mjs",
  "vite.config.mjs",
  "public/mailing-report.html",
  "src/features/fdc-trend/pages/FdcTrendPage.jsx",
  "src/features/fdc-trend/pages/L0SpiderHomePage.jsx",
  "src/features/fdc-trend/routes.jsx",
]

test("SCS runtime에는 My EQP 메뉴, route, API와 report가 없다", async () => {
  const violations = []

  for (const filePath of RUNTIME_FILES) {
    const source = await readFile(filePath, "utf8")
    if (/my[ _-]?eqp|myeqp/i.test(source)) violations.push(filePath)
  }

  assert.deepEqual(violations, [])
})
