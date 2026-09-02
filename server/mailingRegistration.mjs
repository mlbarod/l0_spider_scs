import { spawn } from "node:child_process"
import { fileURLToPath, URL } from "node:url"

import {
  MAPPING_CONFIG_UNAVAILABLE_CODE,
  MAPPING_SCOPE_MISMATCH_CODE,
  assertKnownMappingSdwts,
  readLineMapping,
  requireLineMapping,
} from "./mappingConfig.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

const helperPath = fileURLToPath(new URL("../scripts/mailing_registration.py", import.meta.url))
const MAX_KNOX_ID_LENGTH = 128
const MAX_KNOX_ID_COUNT = 100
const MAX_SDWT_COUNT = 500
const MAX_SDWT_LENGTH = 160

export const MAILING_PRIORITIES = Object.freeze(["A", "B", "D", "M", "N"])

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

function normalizeText(value) {
  return String(value ?? "").trim()
}

function uniqueTextValues(values) {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function normalizeKnoxId(value) {
  const text = normalizeText(value)
  const knoxId = text.includes("@") ? text.slice(0, text.indexOf("@")) : text
  if (!knoxId) throw new Error("knox_id is required.")
  if (knoxId.length > MAX_KNOX_ID_LENGTH || !/^[A-Za-z0-9._-]+$/.test(knoxId)) {
    throw new Error("knox_id has an invalid format.")
  }
  return knoxId
}

async function readJsonBody(req) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > 1024 * 1024) throw new Error("The request payload is too large.")
  }
  if (!body.trim()) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error("The request JSON is invalid.")
  }
}

export function buildMailingRegistrationPayload(body) {
  const requestedKnoxIds = Array.isArray(body?.knoxIds) && body.knoxIds.length
    ? body.knoxIds
    : [body?.knoxId]
  if (requestedKnoxIds.length > MAX_KNOX_ID_COUNT) {
    throw new Error(`No more than ${MAX_KNOX_ID_COUNT} knox_id values may be registered.`)
  }
  const knoxIds = Array.from(new Set(requestedKnoxIds.map(normalizeKnoxId)))
  const sdwts = uniqueTextValues(body?.sdwts)

  if (!sdwts.length || sdwts.length > MAX_SDWT_COUNT) {
    throw new Error(`Select between 1 and ${MAX_SDWT_COUNT} SDWT values.`)
  }
  if (sdwts.some((sdwt) => sdwt.length > MAX_SDWT_LENGTH)) {
    throw new Error(`Each SDWT value must be no more than ${MAX_SDWT_LENGTH} characters.`)
  }

  return {
    knoxId: knoxIds[0],
    knoxIds,
    sdwts,
    priorities: [...MAILING_PRIORITIES],
  }
}

export function buildMailingDeletePayload(body) {
  const payload = buildMailingRegistrationPayload(body)
  const line = normalizeText(body?.line)
  if (!line) throw new Error("The Line Name to delete is required.")
  return { ...payload, line }
}

export function normalizeMailingRecords(records) {
  if (!Array.isArray(records)) return []

  return records.map((record, index) => ({
    id: `${normalizeText(record?.email)}-${index}`,
    knoxId: normalizeText(record?.email),
    sdwts: uniqueTextValues(record?.sdwt),
    priorities: uniqueTextValues(record?.priority),
  })).filter((record) => record.knoxId && record.sdwts.length && record.priorities.length)
}

export function buildMailingRecipientPayloads(payload) {
  const { knoxIds, ...sharedPayload } = payload
  return knoxIds.map((knoxId) => ({
    ...sharedPayload,
    knoxId,
  }))
}

function runMailingHelper(action, payload) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("python3", ["-B", helperPath, action], {
      env: process.env,
      stdio: ["pipe", "pipe", "ignore"],
    })
    let stdout = ""
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, 15_000)

    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on("close", () => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(new Error("Mailing reference processing timed out."))
        return
      }

      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch {
        reject(new Error("Unable to parse the Mailing DB response."))
        return
      }
      if (!result.ok) {
        reject(new Error("Unable to process Mailing reference data."))
        return
      }
      resolvePromise(result)
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

export async function handleMailingRegistrationRequest(
  req,
  res,
  url,
  { mappingReader = readLineMapping } = {},
) {
  if (!new Set(["GET", "POST", "DELETE"]).has(req.method)) {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  try {
    const mapping = await requireLineMapping(mappingReader)
    if (req.method === "GET") {
      const knoxId = normalizeKnoxId(url.searchParams.get("knoxId"))
      const result = await runMailingHelper("list", { knoxId })
      sendJson(res, 200, {
        ok: true,
        registrations: normalizeMailingRecords(result.records),
      })
      return
    }

    const body = await readJsonBody(req)
    if (req.method === "DELETE") {
      const payload = buildMailingDeletePayload(body)
      assertKnownMappingSdwts(mapping, { line: payload.line, sdwts: payload.sdwts })
      const result = await runMailingHelper("delete_line", payload)
      sendJson(res, 200, result)
      return
    }

    const payload = buildMailingRegistrationPayload(body)
    assertKnownMappingSdwts(mapping, { sdwts: payload.sdwts })
    const recipientPayloads = buildMailingRecipientPayloads(payload)
    const results = []
    for (const recipientPayload of recipientPayloads) {
      results.push(await runMailingHelper("insert", recipientPayload))
    }
    const result = {
      ok: true,
      affectedRows: results.reduce((sum, item) => sum + Number(item.affectedRows ?? 0), 0),
      requestedRows: results.reduce((sum, item) => sum + Number(item.requestedRows ?? 0), 0),
      storage: results[0]?.storage,
    }
    sendJson(res, 200, {
      ...result,
      registration: {
        knoxId: payload.knoxId,
        knoxIds: payload.knoxIds,
        sdwts: payload.sdwts,
        priorities: payload.priorities,
      },
    })
  } catch (error) {
    const mappingUnavailable = error.code === MAPPING_CONFIG_UNAVAILABLE_CODE
    const mappingMismatch = error.code === MAPPING_SCOPE_MISMATCH_CODE
    sendJson(res, mappingUnavailable ? 503 : mappingMismatch ? 400 : 500, createSafeApiError({
      code: mappingUnavailable
        ? MAPPING_CONFIG_UNAVAILABLE_CODE
        : mappingMismatch ? MAPPING_SCOPE_MISMATCH_CODE : "MAILING_REGISTRATION_REQUEST_FAILED",
      message: mappingUnavailable
        ? "The Mailing request was stopped because reference mappings are unavailable."
        : mappingMismatch
          ? "The selected Line and SDWT do not match the reference data."
          : "Unable to process the Mailing reference request.",
      scope: "mailing-registration",
    }))
  }
}
