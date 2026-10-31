// Isolated component browser check with synthetic data; no application APIs are called.
import assert from "node:assert/strict"
import test from "node:test"
import { resolve } from "node:path"
import { build } from "vite"
import { chromium } from "playwright"

const fixture = `<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DefectWaferList } from './src/features/fdc-trend/components/DefectWaferList.jsx';
import { LanguageProvider } from './src/i18n/LanguageProvider.jsx';
import './src/styles/globals.css';
const rows = Array.from({length: 105}, (_, i) => ({isNg: true, wafer_id: 'W' + i, tkout_time: 1790762400000, step_seq: '01', eqp_ch: 'EQP_A', lot_id: 'LOT_' + i, root_lot_id: i === 1 ? null : i === 2 ? undefined : 'ROOT_' + i, process_id: null, item_id: 'ITEM', fab_value: i === 0 ? 0 : 1.2345}));
const root = createRoot(document.getElementById('root'));
window.renderRows = (points) => root.render(React.createElement(LanguageProvider, null, React.createElement(DefectWaferList, {points})));
window.renderRows([...rows, {isNg: false, wafer_id: 'EXCLUDED'}]);
</script></body></html>`

test("Wafer grid supports column/range copy, pages, keyboard, data changes and three languages", async () => {
  const bundle = await build({
    configFile: false, root: process.cwd(), logLevel: "error",
    resolve: { alias: { "@": resolve("src") } }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "wafer-test-entry", resolveId(id) { if (id === "wafer-test-entry") return resolve("wafer-test-entry.jsx") },
      load(id) { if (id === resolve("wafer-test-entry.jsx")) return fixture.match(/<script type="module">([\s\S]*?)<\/script>/)[1] } }],
    build: { write: false, rollupOptions: { input: "wafer-test-entry" } },
  })
  const assets = bundle.output
  const entry = assets.find(asset => asset.type === "chunk" && asset.isEntry)
  const styles = assets.filter(asset => asset.fileName.endsWith(".css"))
  const html = `<!doctype html><html><head>${styles.map(asset => `<link rel="stylesheet" href="/${asset.fileName}">`).join("")}</head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>`
  let browser
  try {
    const origin = "http://localhost"
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1500, height: 900 } })
    await context.route("**/*", route => {
      const path = new URL(route.request().url()).pathname
      if (path === "/wafer-test") return route.fulfill({ contentType: "text/html", body: html })
      const asset = assets.find(item => `/${item.fileName}` === path)
      if (!asset) return route.abort()
      return route.fulfill({ contentType: asset.type === "chunk" ? "text/javascript" : "text/css", body: asset.code ?? asset.source })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on("pageerror", error => { errors.push(error.message); console.error(error.message) })
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "ko"))
    await page.goto(`${origin}/wafer-test`)
    await page.getByRole("button", { name: /이상감지 Wafer List 보기/ }).click()
    const cell = (row, col) => page.locator(`[data-cell="${row}-${col}"]`)
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
    await cell(0, 0).waitFor()
    assert.equal(await page.getByRole("gridcell").count(), 800)
    assert.equal(await page.getByText("EXCLUDED", { exact: true }).count(), 0)

    // LOT_ID retains its heading but both display and copy use only root_lot_id.
    assert.equal(await cell(0, 4).textContent(), "ROOT_0")
    assert.equal(await cell(1, 4).textContent(), "—")
    assert.equal(await cell(2, 4).textContent(), "—")
    await page.getByRole("button", { name: "LOT_ID 열 전체 선택", exact: true }).click()
    await page.keyboard.press("Control+c")
    assert.deepEqual((await clipboard()).split("\n"), Array.from({ length: 105 }, (_, i) => i === 1 || i === 2 ? "—" : `ROOT_${i}`))

    // A drag down one column must never include intervening columns.
    const from = await cell(0, 0).boundingBox(), to = await cell(2, 0).boundingBox()
    await page.mouse.move(from.x + 20, from.y + 10)
    await page.mouse.down()
    await page.mouse.move(to.x + 20, to.y + 10, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.press("Control+c")
    assert.equal(await clipboard(), "W0\nW1\nW2")
    assert.equal(await page.locator('td[aria-selected="true"]').count(), 3)

    // Reverse rectangular selection preserves missing values, zero and decimal precision.
    await cell(2, 7).click()
    await cell(0, 5).click({ modifiers: ["Shift"] })
    await page.keyboard.press("Control+c")
    assert.equal(await clipboard(), "—\tITEM\t0\n—\tITEM\t1.2345\n—\tITEM\t1.2345")
    await page.getByRole("button", { name: "WAFER_ID 열 전체 선택", exact: true }).click()
    await page.getByRole("button", { name: "복사", exact: true }).click()
    assert.equal((await clipboard()).split("\n").length, 105)
    assert.ok((await clipboard()).endsWith("W104"))
    await page.getByRole("button", { name: "다음", exact: true }).click()
    assert.equal(await page.getByRole("gridcell").count(), 40)
    assert.equal(await page.locator('td[aria-selected="true"]').count(), 5)
    await cell(100, 0).click()
    await page.keyboard.press("ArrowUp")
    await cell(99, 0).waitFor()
    await page.keyboard.press("Shift+ArrowDown")
    await cell(100, 0).waitFor()
    await page.keyboard.press("Control+c")
    assert.equal(await clipboard(), "W99\nW100")
    await page.keyboard.press("Escape")
    assert.equal(await page.locator('td[aria-selected="true"]').count(), 0)
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Control+c")
    assert.equal((await clipboard()).split("\n").length, 105)
    assert.equal((await clipboard()).split("\n")[0].split("\t").length, 8)

    // HTTP clipboard fallback, then selection invalidation on new data.
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("unavailable")) } }))
    await page.getByRole("button", { name: "복사", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "복사했습니다" }).waitFor()
    await page.evaluate(() => delete navigator.clipboard)
    assert.equal((await clipboard()).split("\n").length, 105)
    await page.evaluate(() => window.renderRows([{ isNg: true, wafer_id: "NEW", fab_value: 0 }]))
    await cell(0, 0).filter({ hasText: "NEW" }).waitFor()
    assert.equal(await page.locator('td[aria-selected="true"]').count(), 0)
    assert.equal(await page.getByRole("button", { name: "복사", exact: true }).count(), 0)

    for (const [language, title, heading] of [["en", "View anomaly Wafer List", "Select entire WAFER_ID column"], ["zh-CN", "查看异常 Wafer List", "选择 WAFER_ID 整列"]]) {
      await page.evaluate(value => localStorage.setItem("l0-spider-language", value), language)
      // Init scripts run on reload, so change language through a fresh page instead.
      const localized = await context.newPage()
      await localized.goto(`${origin}/wafer-test`)
      await localized.getByRole("button", { name: new RegExp(title) }).click()
      await localized.getByRole("button", { name: heading, exact: true }).waitFor()
      await localized.close()
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
  }
})
