import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import Ajv2020 from "ajv/dist/2020.js"

const schema = JSON.parse(readFileSync(
  new URL("../../harness/contracts/dashboard-latest-date-api.schema.json", import.meta.url),
  "utf8",
))

test("Dashboard latest date API success contract accepts only a valid latest_date", () => {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)

  assert.equal(validate({ ok: true, latestDate: "2026-08-27 14:25:30" }), true)
  assert.equal(validate({ ok: true, latestDate: "" }), false)
  assert.equal(validate({ ok: true, latestDate: "2026-08-27" }), false)
})
