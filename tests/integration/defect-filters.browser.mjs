// Run after npm run build. Browser requests use synthetic data only.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { chromium } from "playwright"
import { handleDefectFiltersRequest, handleDefectFileRequest } from "../../server/defectSpiderData.mjs"

test("Defect 버튼 3행과 PRC Group·ALL 선택으로 main_seq·met_seq별 차트를 전환한다", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
    const errors = [], requests = []
    page.on("pageerror", error => errors.push(error.message))
    const mapping = {
      line_mapping: { RAW_A: "L1", RAW_B: "L1", RAW_C: "L2" },
      sdwt_mapping: { RAW_A: "TEAM A", RAW_B: "TEAM B", RAW_C: "TEAM C" },
    }
    const rows = [
      { sdwt: "TEAM A", prc_group: "ETCH", main_seq: "10", met_seq: "20", path: "/synthetic/fail_a.parquet" },
      { sdwt: "TEAM A", prc_group: "ETCH", main_seq: "11", met_seq: "21", path: "/synthetic/fail_b.parquet" },
      { sdwt: "TEAM A", prc_group: "CLEAN", main_seq: "10", met_seq: "20", path: "/synthetic/fail_c.parquet" },
      { sdwt: "TEAM B", prc_group: "DEPO", main_seq: "30", met_seq: "40", path: "/synthetic/fail_d.parquet" },
    ]
    const dependencies = {
      readMapping: async () => mapping,
      resolvePath: () => "/synthetic/fail_list.parquet",
      readRows: async () => rows,
      readFile: async () => ({
        eqp_ch_groups: [{ eqp_ch: "EQP_A" }],
        points: [{ eqp_ch: "EQP_A", tkout_time: Date.UTC(2026, 9, 10), fab_value: 10, step_seq: "10" }],
      }),
      readPmHistory: async () => { throw new Error("Synthetic PM unavailable") },
    }
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      const json = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/mapping-config") return json(mapping)
        if (url.pathname === "/api/auth/session") return json({ ok: true, enabled: false })
        if (url.pathname === "/api/current-user") return json({ ok: true, knoxId: "synthetic.user" })
        if (["/api/defect-filters", "/api/defect-file"].includes(url.pathname)) {
          requests.push(Object.fromEntries(url.searchParams))
          const response = {
            writeHead(status) { this.status = status },
            end(body) { this.body = body },
          }
          const handler = url.pathname === "/api/defect-filters" ? handleDefectFiltersRequest : handleDefectFileRequest
          await handler({ method: "GET" }, response, url, dependencies)
          return route.fulfill({ status: response.status, contentType: "application/json", body: response.body })
        }
        return json({ ok: true, records: [], rows: [] })
      }
      if (url.origin !== "http://defect-filters.test") return route.abort()
      const file = url.pathname.startsWith("/assets/") ? url.pathname.slice(1) : "index.html"
      return route.fulfill({ body: await readFile(resolve("dist", file)), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" })
    })
    const row = title => page.getByRole("group", { name: title, exact: true })
    const button = (title, name) => row(title).getByRole("button", { name, exact: true })
    const waitCharts = count => page.waitForFunction(expected => document.querySelectorAll("[data-defect-scatter]").length === expected, count)
    await page.goto("http://defect-filters.test/defect-spider")
    await waitCharts(3)
    assert.equal(await button("PRC Group", "ALL").getAttribute("aria-pressed"), "true")
    const positions = await Promise.all(["Line Name", "SDWT", "PRC Group"].map(title => row(title).boundingBox()))
    assert.ok(positions[0].y < positions[1].y && positions[1].y < positions[2].y)
    assert.equal(await page.getByRole("textbox").count(), 0)
    assert.equal(await page.getByRole("group", { name: /^(main_seq|met_seq)$/ }).count(), 0)

    await button("PRC Group", "ETCH").click()
    await waitCharts(2)
    assert.deepEqual(await page.locator("article h3").allTextContents(), ["EQP_A / 10 / 20 / —", "EQP_A / 11 / 21 / —"])
    assert.equal(await page.getByRole("region", { name: "PRC Group CLEAN", exact: true }).count(), 0)
    await button("PRC Group", "CLEAN").click()
    await waitCharts(1)
    assert.equal(await page.getByRole("region", { name: "PRC Group ETCH", exact: true }).count(), 0)
    await button("PRC Group", "ALL").click()
    await waitCharts(3)
    await button("PRC Group", "ETCH").click()
    await button("SDWT", "TEAM B").click()
    await button("PRC Group", "DEPO").waitFor()
    await waitCharts(1)
    assert.equal(await button("PRC Group", "ALL").getAttribute("aria-pressed"), "true")
    assert.deepEqual(await page.locator("article h3").allTextContents(), ["EQP_A / 30 / 40 / —"])
    await button("Line Name", "L2").click()
    await page.getByText("선택 조건에 해당하는 PRC Group이 없습니다.", { exact: true }).waitFor()
    assert.equal(await page.locator("article").count(), 0)
    assert.equal(await button("SDWT", "TEAM C").getAttribute("aria-pressed"), "true")
    for (const request of requests.filter(request => request.prcGroup)) {
      assert.equal(request.mainAll, "1")
      assert.equal(request.metAll, "1")
      assert.equal(request.mainSeq, undefined)
      assert.equal(request.metSeq, undefined)
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
