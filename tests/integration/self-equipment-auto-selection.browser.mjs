// Run after npm run build. All requests use synthetic data; no production access.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { chromium } from "playwright"
import { buildSelfEquipmentPayload } from "../../server/selfEquipmentData.mjs"

test("Grade 선택으로 ALL·CRITICAL 차트를 표시하고 수동 선택과 재선택을 유지한다", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } })
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
    const histories = [], queries = [], errors = []
    page.on("pageerror", error => errors.push(error.message))
    const rows = ["A", "B", "D", "N", "M"].flatMap((priority, index) => ["ALARM", "WARN"].map(status => ({
      line_rev: "L1", sdwt: "TEAM A", priority, prc_group: index % 2 ? "CLEAN" : "ETCH",
      desc: `R${index}`, recipe_id: `R${index}`, ver: "V1", sensor: "TEMP", step: "10", status,
      eqp: `EQP-${index}-${status}.png`,
      file_path: `/synthetic/${priority}/${status}/data.parquet`,
    })))
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      const json = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/mapping-config") return json({
          line_mapping: { TEAM_A: "L1", TEAM_B: "L1" }, sdwt_mapping: { TEAM_A: "TEAM A", TEAM_B: "TEAM B" },
          capabilities: { selfEquipmentFileRead: true, selfEquipmentDb: true, dbConnections: true },
        })
        if (url.pathname === "/api/auth/session") return json({ ok: true, enabled: false })
        if (url.pathname === "/api/current-user") return json({ ok: true, knoxId: "synthetic.user" })
        if (url.pathname === "/api/self-equipment-data") {
          const filters = { ...Object.fromEntries(url.searchParams), priorities: url.searchParams.getAll("priority") }
          queries.push(filters)
          return json(buildSelfEquipmentPayload(rows, filters))
        }
        if (url.pathname === "/api/clicked-category-history") {
          histories.push(route.request().postDataJSON())
          return json({ ok: true, affectedRows: 1 })
        }
        if (url.pathname === "/api/erd-scatter-data") return json({ points: [
          { actTimeMs: Date.UTC(2026, 9, 12), value: 10, isRecent: true },
          { actTimeMs: Date.UTC(2026, 9, 13), value: 12, isRecent: true },
        ], groups: [], groupCount: 0, pointCount: 2 })
        return json({ ok: true, records: [], rows: [], points: [], groups: [] })
      }
      if (url.origin !== "http://self-selection.test") return route.abort()
      const file = url.pathname.startsWith("/assets/") ? url.pathname.slice(1) : "index.html"
      return route.fulfill({ body: await readFile(resolve("dist", file)), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" })
    })
    const card = title => page.locator('[data-slot="card"]').filter({ has: page.getByText(title, { exact: true }) }).first()
    const gradeButton = grade => card("Sensor Grade").getByRole("button", { name: grade, exact: true })
    const waitHistory = count => page.waitForResponse(response => response.url().includes("/api/clicked-category-history") && histories.length === count)
    const assertAll = async () => {
      for (const title of ["PRC_Group", "eqp_ch", "sensor", "ch_step"]) {
        assert.match(await card(title).getByRole("button", { name: /^ALL/ }).getAttribute("class"), /ring-1/)
      }
      for (const key of ["prcGroup", "eqpCh", "sensor", "chStep"]) assert.equal(queries.at(-1)[key], "ALL")
    }
    await page.goto("http://self-selection.test/self-equipment")
    await gradeButton("A/B").waitFor()
    await page.getByRole("switch").click()
    assert.doesNotMatch(await gradeButton("A/B").getAttribute("class"), /ring-1/)
    const first = waitHistory(1)
    await gradeButton("A/B").click()
    await first
    await page.locator(".recharts-scatter-symbol").first().waitFor()
    await assertAll()
    assert.equal(await page.getByRole("button", { name: "CRITICAL", exact: true }).getAttribute("aria-pressed"), "true")
    assert.equal(await page.locator("article").count(), 2, "ALARM만 표시")
    assert.deepEqual(histories[0].grades, ["A", "B"])
    assert.equal(histories[0].selectedSensor, "ALL")
    await page.getByRole("button", { name: "CRITICAL", exact: true }).click()
    assert.equal(await page.locator("article").count(), 4, "필터 해제 시 WARN도 표시")
    await page.getByRole("button", { name: "WARNING", exact: true }).click()
    assert.equal(await page.locator("article").count(), 2)

    const second = waitHistory(2)
    await gradeButton("D").click()
    await second
    await assertAll()
    assert.equal(await page.getByRole("button", { name: "CRITICAL", exact: true }).getAttribute("aria-pressed"), "true")
    assert.deepEqual(histories[1].grades, ["A", "B", "D"])
    await card("PRC_Group").getByRole("button", { name: /^CLEAN/ }).click()
    await card("eqp_ch").getByRole("button", { name: /^ALL/ }).click()
    await card("sensor").getByRole("button", { name: /^TEMP/ }).click()
    const manual = waitHistory(3)
    await card("ch_step").getByRole("button", { name: /^ALL/ }).click()
    await manual
    assert.equal(queries.at(-1).prcGroup, "CLEAN")
    assert.equal(histories[2].selectedSensor, "TEMP")

    await page.getByRole("button", { name: "TEAM A", exact: true }).click()
    assert.equal(await card("Sensor Grade").locator("button.ring-1").count(), 0)
    assert.equal(await page.locator("article").count(), 0)
    for (const grade of ["D", "N", "M", "A/B"]) {
      const count = histories.length + 1
      const history = waitHistory(count)
      await gradeButton(grade).click()
      await history
      await page.locator(".recharts-scatter-symbol").first().waitFor()
      await assertAll()
      assert.deepEqual(histories.at(-1).grades, grade === "A/B" ? ["A", "B"] : [grade])
      await gradeButton(grade).click()
      assert.equal(await page.locator("article").count(), 0)
      assert.equal(histories.length, count)
    }
    // Empty grade result is a normal empty state, without a history write/error.
    await page.getByRole("button", { name: "TEAM B", exact: true }).click()
    const empty = page.waitForResponse(response => response.url().includes("/api/self-equipment-data") && response.url().includes("chStep=ALL"))
    await gradeButton("D").click()
    await empty
    assert.equal(await page.locator("article").count(), 0)
    assert.equal(histories.length, 7)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
