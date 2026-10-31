// Render affected screens using synthetic data without contacting application APIs.
import assert from "node:assert/strict"
import test from "node:test"
import { resolve } from "node:path"
import { build } from "vite"
import { chromium } from "playwright"

const entryCode = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from './src/i18n/LanguageProvider.jsx';
import { SpiderFeaturePage } from './src/features/fdc-trend/pages/SpiderFeaturePage.jsx';
import { DefectPmHistory } from './src/features/fdc-trend/components/DefectPmHistory.jsx';
import { DefectScatterChart } from './src/features/fdc-trend/components/DefectScatterChart.jsx';
import './src/styles/globals.css';
const root = createRoot(document.getElementById('root'));
const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
const sourcePath = '/appdata/synthetic/private/pm.parquet';
const points = [{eqp_ch: 'EQP', tkout_time: 1790762400000, fab_value: 1, final_decision: 'NG'}];
window.showScreen = (screen) => {
  const child = screen.startsWith('pm')
    ? React.createElement(DefectPmHistory, {key: screen, sourcePath, columns: ['asset'], rows: [{timestamp: 1790762400000, raw: {asset: 'EQP'}}], error: screen === 'pm-error' ? 'ENOENT: stat ' + sourcePath : undefined})
    : screen === 'scatter-error'
      ? React.createElement(DefectScatterChart, {failData: {points, scatter_error: 'Read failed: ' + sourcePath}, allData: {points}, eqpCh: 'EQP'})
      : React.createElement(SpiderFeaturePage, {key: screen, type: screen});
  root.render(React.createElement(LanguageProvider, null, React.createElement(QueryClientProvider, {client}, React.createElement(MemoryRouter, null, child))));
};
window.showScreen('pm');
`

test("PM history and shared pages hide source paths while retaining data and errors", async () => {
  const entryPath = resolve("file-path-display-test.jsx")
  const bundle = await build({
    configFile: false, root: process.cwd(), logLevel: "error",
    resolve: { alias: { "@": resolve("src") } }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "file-path-display-test", resolveId(id) { if (id === entryPath) return id }, load(id) { if (id === entryPath) return entryCode } }],
    build: { write: false, rollupOptions: { input: entryPath } },
  })
  const assets = bundle.output
  const entry = assets.find(asset => asset.type === "chunk" && asset.isEntry)
  const html = `<!doctype html><html><body><div id="root"></div>${assets.filter(asset => asset.fileName.endsWith(".css")).map(asset => `<link rel="stylesheet" href="/${asset.fileName}">`).join("")}<script type="module" src="/${entry.fileName}"></script></body></html>`
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
    await page.route("**/*", route => {
      const path = new URL(route.request().url()).pathname
      if (path === "/test") return route.fulfill({ contentType: "text/html", body: html })
      const asset = assets.find(item => `/${item.fileName}` === path)
      if (!asset) return route.abort()
      return route.fulfill({ contentType: asset.type === "chunk" ? "text/javascript" : "text/css", body: asset.code ?? asset.source })
    })
    const assertNoPaths = async () => {
      const display = await page.evaluate(() => document.body.innerText + [...document.querySelectorAll("[title], [aria-label]")].map(node => `${node.title} ${node.getAttribute("aria-label")}`).join(" "))
      assert.doesNotMatch(display, /\/appdata|private\/pm\.parquet|SPIDER Data Paths|변경점 파일 로드 경로/)
    }
    await page.goto("http://localhost/test")
    await page.getByRole("button", { name: /PM이력 보기/ }).waitFor()
    await assertNoPaths()
    await page.getByRole("button", { name: /PM이력 보기/ }).click()
    await page.getByRole("cell", { name: "EQP", exact: true }).waitFor()
    await assertNoPaths()
    await page.evaluate(() => window.showScreen("pm-error"))
    await page.getByRole("button", { name: /로드 오류/ }).waitFor()
    await assertNoPaths()
    await page.getByRole("button", { name: /PM이력 보기/ }).click()
    await page.getByRole("alert").waitFor()
    assert.match(await page.getByRole("alert").innerText(), /ENOENT.*\[file path hidden\]/)
    await assertNoPaths()
    await page.evaluate(() => window.showScreen("scatter-error"))
    await page.getByRole("alert").filter({ hasText: "Read failed:" }).waitFor()
    await assertNoPaths()
    for (const [type, heading] of [["l1", "L1 SPIDER"], ["l3", "L3 SPIDER"], ["hardSpec", "FDC Hard Limit Recommendations"], ["yieldSpec", "Yield-Based Hard Limit Recommendations"]]) {
      await page.evaluate(value => window.showScreen(value), type)
      await page.getByRole("heading", { name: heading, exact: true }).waitFor()
      await assertNoPaths()
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
