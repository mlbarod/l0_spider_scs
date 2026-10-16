// Real node server + Python helpers + isolated SQLite driver. No operational DB/files.
import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { chromium } from "playwright"
import { handleMyEqpEquipmentDataRequest } from "../../server/myEqpEquipmentData.mjs"
import { normalizeSensorExclusionConfig } from "../../server/sensorExclusionConfig.mjs"

const driver = `
import sqlite3
from pathlib import Path
class Connection:
    def __init__(self): self.db = sqlite3.connect(Path(__file__).with_name('synthetic.db'))
    def __enter__(self): return self
    def __exit__(self, *args): self.db.close()
    def cursor(self): return Cursor(self.db)
    def commit(self): self.db.commit()
    def rollback(self): self.db.rollback()
class Cursor:
    def __init__(self, db): self.db = db
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def execute(self, sql, params=()):
        assert 'ALTER TABLE' not in sql and 'CREATE TABLE' not in sql
        sql = sql.replace('TIMESTAMPADD(DAY, \\x60periode\\x60, \\x60exec_date\\x60) > NOW()', "datetime(exec_date, '+' || periode || ' days') > datetime('now', 'localtime')")
        self.result = self.db.execute(sql.replace('%s', '?'), params)
        return self.result.rowcount
    def executemany(self, sql, params):
        self.result = self.db.executemany(sql.replace('%s', '?'), params)
        return self.result.rowcount
    def fetchone(self): return self.result.fetchone()
    def fetchall(self): return self.result.fetchall()
def connect(**kwargs):
    assert kwargs['host'] == 'synthetic.invalid'
    return Connection()
`
const mapping = { line_mapping: { TEAM_A: "L1", TEAM_B: "L1" }, sdwt_mapping: { TEAM_A: "Team A", TEAM_B: "Team B" }, capabilities: { dbConnections: true, selfEquipmentDb: true, selfEquipmentFileRead: true } }

test("node server.mjs에서 MY EQP 복수 수신인·ALL 등록, 조회·삭제와 중국어 화면", { timeout: 90000 }, async context => {
  const root = await mkdtemp(join(tmpdir(), "scs-my-eqp-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, "pymysql.py"), driver)
  await writeFile(join(root, "mapping.json"), JSON.stringify(mapping))
  execFileSync("python3", ["-B", "-c", `
import sqlite3,pickle,sys
from pathlib import Path
root=Path(sys.argv[1])
pickle.dump(dict(DB_HOST='synthetic.invalid', DB_PORT=3306, DB_NAME='synthetic', DB_USER='synthetic', DB_PASSWORD='synthetic'),open(root/'db.pkl','wb'))
db=sqlite3.connect(root/'synthetic.db')
db.execute('CREATE TABLE user_ip_mapping (ip_address TEXT PRIMARY KEY, knox_id TEXT)')
db.execute("INSERT INTO user_ip_mapping VALUES ('127.0.0.1','owner')")
db.execute('CREATE TABLE myeqp_regist (line, sdwt, prc_group, eqp, exec_date, periode, comment, knox_id, is_public)')
db.commit()
`, root])
  const portFinder = createServer().listen(0, "127.0.0.1")
  await once(portFinder, "listening")
  const port = portFinder.address().port
  await new Promise(resolve => portFinder.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), LIVE_RELOAD: "0", BUILD_ON_START: "0",
      SCS_DATA_CONNECTIONS_ENABLED: "0", SCS_DB_CONNECTIONS_ENABLED: "1", SCS_SELF_EQUIPMENT_DATA_ENABLED: "1", SPIDER_MASTER_KNOX_IDS: "",
      SCS_EQP_REFERENCE_PATH: fileURLToPath(new URL("../fixtures/my-eqp-reference.parquet", import.meta.url)),
      DB_INFO_PATH: join(root, "db.pkl"), PYTHONPATH: root, MAPPING_CONFIG_PATH: join(root, "mapping.json") },
    stdio: ["ignore", "pipe", "pipe"],
  })
  context.after(async () => { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit") } })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("synthetic server startup timeout")), 15000)
    child.stdout.on("data", data => { if (String(data).includes("server listening")) { clearTimeout(timeout); resolve() } })
    child.once("exit", () => { clearTimeout(timeout); reject(new Error("synthetic server stopped")) })
  })
  const refResponse = await fetch(`${base}/api/my-eqp-reference`)
  assert.equal(refResponse.status, 200)
  assert.equal((await refResponse.json()).rows.length, 3)
  const headReference = await fetch(`${base}/api/my-eqp-reference`, { method: "HEAD" })
  assert.equal(headReference.status, 200)
  assert.equal(await headReference.text(), "")
  const noRegistration = await fetch(`${base}/api/my-eqp-equipment-data?line=L1`)
  assert.equal(noRegistration.status, 200)
  assert.deepEqual((await noRegistration.json()).rows, [])

  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
  const errors = [], chartCalls = []
  page.on("pageerror", error => errors.push(error.message))
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url())
    const json = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
    if (["/api/current-user", "/api/my-eqp-registration", "/api/my-eqp-reference"].includes(url.pathname)) return route.continue()
    if (url.pathname === "/api/mapping-config") return json(mapping)
    if (url.pathname === "/api/my-eqp-equipment-data") {
      chartCalls.push(url)
      const req = { method: "GET", headers: {}, socket: { remoteAddress: "127.0.0.1" } }
      const res = { writeHead(status) { this.status = status }, end(body) { this.body = body } }
      await handleMyEqpEquipmentDataRequest(req, res, url, {
        resolveUser: async () => ({ knoxId: "owner" }), mappingReader: async () => mapping,
        listRegistrations: async () => {
          const payload = await (await fetch(`${base}/api/my-eqp-registration?line=L1&activeOnly=true`)).json()
          return payload.registrations.flatMap(item => item.eqps.map(eqp => ({ sdwt: item.sdwt, eqp })))
        },
        readRows: async () => ({ rows: ["EQP01-A", "EQP02-B", "NOT-MINE"].map(eqp => ({
          eqp: `${eqp}.png`, sdwt: "Team A", priority: "A", recipe_id: "R1", desc: "R1", ver: "V1", sensor: "TEMP", step: "10", status: "ALARM", file_path: "/synthetic/data.parquet",
        })) }),
        readReference: async () => ({ rows: [{ main: "EQP01", sdwt_prod: "Team A", prc_group: "ETCH" }, { main: "EQP02", sdwt_prod: "Team A", prc_group: "ETCH" }] }),
        listPassRecords: async () => [], readExclusions: async () => normalizeSensorExclusionConfig({ version: 1, apps: {} }),
      })
      return route.fulfill({ status: res.status, body: res.body, contentType: "application/json" })
    }
    if (url.pathname === "/api/erd-scatter-data") return json({ points: [], changeHistory: [], pointCount: 0 })
    return json({ ok: true, registrations: [], records: [], rows: [], lines: [], affectedRows: 1 })
  })
  await page.goto(`${base}/`)
  await page.locator('a[href="/registration"]').click()
  await page.getByRole("heading", { name: "MY EQP Registration", exact: true }).waitFor()
  await page.getByRole("button", { name: "ETCH", exact: true }).click()
  await page.getByRole("button", { name: /^ALL/ }).click()
  assert.equal(await page.getByRole("button", { name: "EQP01_A", exact: true }).isDisabled(), true)
  await page.getByLabel("Number of days", { exact: true }).fill("7")
  await page.locator("#my-eqp-comment").fill("synthetic monitor")
  await page.locator("#my-eqp-recipient-knox-id").fill("colleague")
  await page.locator("#my-eqp-recipient-knox-id").press("Enter")
  const saved = page.waitForResponse(response => response.url().endsWith("/api/my-eqp-registration") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Save MY EQP", exact: true }).click()
  const savedResponse = await saved
  assert.equal(savedResponse.status(), 200)
  assert.equal((await savedResponse.json()).affectedRows, 4)
  const registrations = await (await fetch(`${base}/api/my-eqp-registration?line=L1`)).json()
  assert.equal(registrations.registrations.length, 1)
  assert.deepEqual(registrations.registrations[0].eqps, ["EQP01_A", "EQP02_B"])
  assert.equal(registrations.registrations[0].ownedByCurrentUser, true)
  await page.goto(`${base}/self-equipment?line=L1`)
  await page.getByRole("button", { name: "MY EQP", exact: true }).click()
  await page.getByRole("button", { name: "A/B", exact: true }).click()
  await page.getByRole("heading", { name: "EQP01-A", exact: true }).first().waitFor()
  await page.getByRole("heading", { name: "EQP02-B", exact: true }).first().waitFor()
  assert.equal(await page.getByRole("heading", { name: "NOT-MINE", exact: true }).count(), 0)
  assert.ok(chartCalls.length > 1)
  await page.goto(`${base}/fdc_trend/registration`)
  const registeredSection = page.locator('section[aria-labelledby="registered-my-eqp-title"]')
  await registeredSection.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  assert.equal((await (await fetch(`${base}/api/my-eqp-registration?line=L1`)).json()).registrations.length, 1)
  await registeredSection.getByRole("button", { name: "Delete", exact: true }).click()
  const deleted = page.waitForResponse(response => response.url().endsWith("/api/my-eqp-registration") && response.request().method() === "DELETE")
  await dialog.getByRole("button", { name: "Delete", exact: true }).click()
  assert.equal((await deleted).status(), 200)
  await page.getByText("No MY EQP conditions are available for this Line.").waitFor()
  await page.goto(`${base}/self-equipment?line=L1`)
  await page.getByText("knox_id: owner").waitFor()
  assert.equal(await page.getByRole("button", { name: "MY EQP", exact: true }).count(), 0)
  // New document uses Chinese, including the copied registration UI.
  await page.addInitScript(() => localStorage.setItem("l0-spider-language", "zh-CN"))
  await page.goto(`${base}/under-construction/my-eqp-registration`)
  await page.getByRole("heading", { name: "MY EQP 注册", exact: true }).waitFor()
  assert.doesNotMatch(await page.locator("body").innerText(), /[가-힣]/)
  await page.screenshot({ path: "/tmp/scs-my-eqp-chinese.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  // Reference candidates remain available when registration DB access is disabled.
  await page.route("**/api/mapping-config", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ...mapping, capabilities: { ...mapping.capabilities, dbConnections: false, selfEquipmentDb: false } }),
  }))
  await page.evaluate(() => localStorage.setItem("l0-spider-language", "en"))
  await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
  await page.goto(`${base}/registration`)
  await page.getByRole("button", { name: "ETCH", exact: true }).click()
  await page.getByRole("button", { name: "EQP01_A", exact: true }).waitFor()
  assert.equal(await page.getByRole("button", { name: "Save MY EQP", exact: true }).isDisabled(), true)
  assert.deepEqual(errors, [])
})
