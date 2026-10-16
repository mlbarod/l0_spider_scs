// Built UI with isolated synthetic API responses; never contacts an operational API.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { chromium } from "playwright"
import { buildSelfEquipmentPayload } from "../../server/selfEquipmentData.mjs"

test("이력 게시판 진입·검색·페이지·상세·오류 복구와 모바일 화면", async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
    const errors = []
    const requests = []
    let fail = false
    page.on("pageerror", error => errors.push(error.message))
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
      if (url.pathname === "/api/current-user") return json({ ok: true, knoxId: "synthetic.user", registrationRequired: false })
      if (url.pathname === "/api/hit-history") {
        requests.push(url)
        if (fail) return json({ error: "Synthetic history failure" }, 500)
        const currentPage = Number(url.searchParams.get("page"))
        const empty = url.searchParams.get("lineId") === "EMPTY"
        const count = empty ? 0 : currentPage === 1 ? 20 : 1
        return json({ ok: true, total: empty ? 0 : 21, page: currentPage, pageSize: 20,
          records: Array.from({ length: count }, (_, index) => ({
            update_date: "2026-10-15", exec_date: "2026-10-16 10:00:00", line_id: "L1", sdwt: "TEAM",
            knox_id: "synthetic.user", file_path: `#synthetic#sensor#chart-${currentPage}-${index}.png`,
          })),
        })
      }
      if (url.pathname.startsWith("/api/")) return json({ ok: true, records: [], rows: [], lines: [] })
      if (url.origin !== "http://history.test") return route.abort()
      const file = url.pathname.startsWith("/assets/") ? url.pathname.slice(1) : "index.html"
      return route.fulfill({ body: await readFile(resolve("dist", file)), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" })
    })
    await page.goto("http://history.test/")
    await page.getByRole("link").filter({ hasText: "Saved History Board" }).click()
    await page.getByRole("heading", { name: "Saved History Board" }).waitFor()
    await page.getByRole("button", { name: "synthetic / sensor / chart-1-0.png", exact: true }).click()
    await page.getByRole("dialog").getByText("/synthetic/sensor/chart-1-0.png", { exact: true }).waitFor()
    await page.getByRole("dialog").getByText("No image was stored with this history record.").waitFor()
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await page.getByRole("button", { name: "synthetic / sensor / chart-2-0.png", exact: true }).waitFor()
    assert.equal(requests.at(-1).searchParams.get("page"), "2")
    await page.getByLabel("Line Name", { exact: true }).fill("EMPTY")
    await page.getByLabel("Saved from").fill("2026-10-15")
    await page.getByLabel("Saved until").fill("2026-10-16")
    await page.getByRole("button", { name: "Search", exact: true }).click()
    await page.getByText("No saved history matches these filters. Use Save History on a chart to add a record.").waitFor()
    assert.equal(requests.at(-1).searchParams.get("page"), "1")
    assert.equal(requests.at(-1).searchParams.get("dateTo"), "2026-10-16")
    await page.getByLabel("Saved from").fill("2026-10-17")
    assert.equal(await page.getByRole("button", { name: "Search", exact: true }).isDisabled(), true)
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await page.getByRole("button", { name: "synthetic / sensor / chart-1-0.png", exact: true }).waitFor()
    fail = true
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "Synthetic history failure" }).waitFor()
    fail = false
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await page.getByRole("button", { name: "synthetic / sensor / chart-1-0.png", exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.goto("http://history.test/fdc_trend/history")
    await page.getByRole("heading", { name: "Saved History Board" }).waitFor()
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test("실제 차트 PNG 생성·재시도·확대 상태 보존·게시판 이미지 표시", async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
    const posts = [], records = [], errors = []
    const images = new Map()
    let failedImage = false
    page.on("pageerror", error => errors.push(error.message))
    const rows = [{ line_rev: "L1", sdwt: "TEAM A", priority: "A", prc_group: "ETCH", desc: "R1",
      recipe_id: "R1", ver: "V1", sensor: "TEMP", step: "10", status: "ALARM", latest_date: "2026-10-15",
      eqp: "EQP-1.png", file_path: "/synthetic/A/data.parquet" }]
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
      if (url.pathname === "/api/mapping-config") return json({
        line_mapping: { TEAM_A: "L1" }, sdwt_mapping: { TEAM_A: "TEAM A" },
        capabilities: { selfEquipmentFileRead: true, selfEquipmentDb: true, dbConnections: true },
      })
      if (url.pathname === "/api/current-user") return json({ ok: true, knoxId: "synthetic.user", registrationRequired: false })
      if (url.pathname === "/api/self-equipment-data") return json(buildSelfEquipmentPayload(rows, { ...Object.fromEntries(url.searchParams), priorities: url.searchParams.getAll("priority") }))
      if (url.pathname === "/api/erd-scatter-data") return json({ points: Array.from({ length: 20 }, (_, index) => ({
        actTimeMs: Date.UTC(2026, 9, 12) + index * 3600000, value: 10 + index, isRecent: index > 10,
      })), changeHistory: [], pointCount: 20 })
      if (url.pathname === "/api/hit-history") {
        if (route.request().method() === "POST") {
          const input = route.request().postDataJSON()
          posts.push(input)
          if (posts.length === 1) return route.abort("failed")
          const imageId = String(records.length + 1).padStart(64, "0")
          images.set(imageId, Buffer.from(input.image.split(",")[1], "base64"))
          records.push({ image_id: imageId, file_path: input.filePath.replaceAll("/", "#"), knox_id: "synthetic.user",
            line_id: input.lineId, sdwt: input.sdwt, update_date: input.updateDate, exec_date: input.execDate })
          return json({ ok: true, affectedRows: 1, imageId })
        }
        if (url.searchParams.has("imageId")) {
          if (failedImage) return route.fulfill({ status: 500, body: "synthetic error" })
          return route.fulfill({ contentType: "image/png", body: images.get(url.searchParams.get("imageId")) })
        }
        return json({ ok: true, records, total: records.length, page: 1, pageSize: 20 })
      }
      if (url.pathname.startsWith("/api/")) return json({ ok: true, records: [], rows: [], points: [], groups: [] })
      if (url.origin !== "https://snapshot.test") return route.abort()
      const file = url.pathname.startsWith("/assets/") ? url.pathname.slice(1) : "index.html"
      return route.fulfill({ body: await readFile(resolve("dist", file)), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" })
    })
    await page.goto("https://snapshot.test/self-equipment")
    await page.getByRole("switch").click()
    const grade = page.locator('[data-slot="card"]').filter({ has: page.getByText("Sensor Grade", { exact: true }) }).first()
    await grade.getByRole("button", { name: "A/B", exact: true }).click()
    await page.locator(".recharts-scatter-symbol").first().waitFor()
    const save = page.getByRole("button", { name: "Save History", exact: true })
    await save.click()
    await page.getByText("Failed to fetch", { exact: true }).waitFor()
    await save.click()
    await page.getByText("History saved", { exact: true }).waitFor()
    assert.equal(posts.length, 2)
    assert.deepEqual(posts[0], posts[1], "재시도 시 PNG·저장시각·요청 ID 유지")
    const png = Buffer.from(posts[1].image.split(",")[1], "base64")
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
    assert.equal(png.readUInt32BE(16), 600)
    assert.equal(png.readUInt32BE(20), 240)
    const chart = page.locator("article .cursor-crosshair").first()
    await chart.scrollIntoViewIfNeeded()
    const box = await chart.boundingBox()
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 10 })
    await page.mouse.up()
    const zoomTicks = await chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents()
    const saved = page.waitForResponse(response => response.url().endsWith("/api/hit-history") && response.request().method() === "POST")
    await save.click()
    await saved
    assert.equal(posts[2].image, posts[0].image, "확대 중에도 전체 범위 PNG를 저장")
    assert.notEqual(posts[2].requestId, posts[0].requestId)
    assert.deepEqual(await chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents(), zoomTicks)
    await page.goto("https://snapshot.test/history")
    await page.getByRole("button", { name: "synthetic / A / data.parquet", exact: true }).first().click()
    const image = page.getByRole("dialog").getByRole("img", { name: "Saved chart image" })
    await image.waitFor()
    await page.waitForFunction(() => document.querySelector('[role="dialog"] img')?.naturalWidth === 600)
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
    failedImage = true
    await page.getByRole("button", { name: "synthetic / A / data.parquet", exact: true }).first().click()
    await page.getByText("Unable to load the saved chart image.").waitFor()
    failedImage = false
    await page.getByRole("button", { name: "Retry image" }).click()
    await page.waitForFunction(() => document.querySelector('[role="dialog"] img')?.naturalWidth === 600)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
