// Uses built assets and synthetic API responses only. No server or operational DB.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { chromium } from "playwright"

test("최초 등록·재접속·IP 변경·DB 오류·DB 비활성 화면을 확인한다", async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.addInitScript(() => localStorage.setItem("l0-spider-language", "en"))
    const users = new Map()
    const errors = []
    const submissions = []
    let ipAddress = "192.0.2.10"
    let mode = "ready"
    page.on("pageerror", error => errors.push(error.message))
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
      if (url.pathname === "/api/current-user") {
        if (mode === "disabled") return json({ ok: false, code: "DATA_CONNECTIONS_DISABLED", error: "DB disabled" }, 503)
        if (mode === "failed") return json({ ok: false, code: "CURRENT_USER_DB_FAILED", error: "Unable to access user registration. Please try again or contact the administrator." }, 503)
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON()
          submissions.push(body)
          if (mode === "save-failed") return json({ ok: false, code: "CURRENT_USER_DB_FAILED", error: "Registration failed" }, 503)
          if (mode === "conflict") return json({ ok: false, code: "IP_ALREADY_REGISTERED", error: "Another knox_id is already registered. Contact the administrator." }, 409)
          users.set(ipAddress, body.knoxId)
        }
        return json({ ok: true, ipAddress, knoxId: users.get(ipAddress) ?? null, registrationRequired: !users.has(ipAddress) })
      }
      if (url.pathname === "/api/mapping-config") return json({ line_mapping: { TEAM: "L1" }, sdwt_mapping: { TEAM: "TEAM" }, capabilities: { dbConnections: mode !== "disabled", selfEquipmentFileRead: true } })
      if (url.pathname.startsWith("/api/")) return json({ ok: true, records: [], rows: [], points: [], groups: [] })
      if (url.origin !== "http://registration.test") return route.abort()
      const file = url.pathname.startsWith("/assets/") ? url.pathname.slice(1) : "index.html"
      return route.fulfill({ body: await readFile(resolve("dist", file)), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" })
    })
    await page.goto("http://registration.test/")
    await page.getByRole("heading", { name: "User registration", exact: true }).waitFor()
    assert.doesNotMatch(await page.locator("main").innerText(), /\bIP\b|192\.0\.2\.10/)
    const input = page.getByLabel("knox_id", { exact: true })
    const submit = page.getByRole("button", { name: "Register and continue", exact: true })
    assert.equal(await submit.isDisabled(), true)
    await input.fill("invalid@email")
    assert.equal(await submit.isDisabled(), true)
    await input.fill(" example.user ")
    mode = "save-failed"
    await submit.click()
    await page.getByRole("alert").filter({ hasText: "Registration failed" }).waitFor()
    assert.equal(await input.inputValue(), " example.user ")
    mode = "ready"
    await submit.click()
    await page.getByRole("heading", { name: "User registration", exact: true }).waitFor({ state: "detached" })
    assert.deepEqual(submissions.at(-1), { knoxId: "example.user" })
    const reconnected = page.waitForResponse(response => response.url().endsWith("/api/current-user"))
    await page.reload()
    await reconnected
    assert.equal(await page.getByLabel("knox_id", { exact: true }).count(), 0)
    await page.goto("http://registration.test/self-equipment?line=L1")
    await page.getByText("knox_id: example.user", { exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get("line"), "L1")
    ipAddress = "192.0.2.20"
    await page.reload()
    await input.waitFor()
    await input.fill("second.user")
    mode = "conflict"
    await submit.click()
    await page.getByRole("alert").filter({ hasText: "already registered" }).waitFor()
    users.set(ipAddress, "first.user")
    mode = "ready"
    await page.getByRole("button", { name: "Check registration again" }).click()
    await page.getByText("knox_id: first.user", { exact: true }).waitFor()
    mode = "failed"
    await page.reload()
    await page.getByRole("alert").filter({ hasText: "Unable to access user registration" }).waitFor()
    assert.equal(await input.count(), 0)
    mode = "ready"
    await page.getByRole("button", { name: "Check registration again" }).click()
    await page.getByText("knox_id: first.user", { exact: true }).waitFor()
    mode = "disabled"
    await page.reload()
    await page.getByText("DB features are not connected.", { exact: true }).waitFor()
    assert.equal(await input.count(), 0)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
