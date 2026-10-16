import { spawn } from "node:child_process"
import { fileURLToPath, URL } from "node:url"

import { getRemoteIp, resolveCurrentUser, sendCurrentUserError } from "./currentUser.mjs"
import { readMyEqpReferenceRows } from "./myEqpReference.mjs"
import { filterMyEqpReferenceRowsBySdwt } from "../src/features/fdc-trend/utils/myEqpReferenceMatching.mjs"
import {
  MAPPING_CONFIG_UNAVAILABLE_CODE,
  MAPPING_SCOPE_MISMATCH_CODE,
  assertKnownMappingLine,
  assertKnownMappingSdwts,
  readLineMapping,
  requireLineMapping,
} from "./mappingConfig.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

const helperPath = fileURLToPath(new URL("../scripts/my_eqp_registration.py", import.meta.url))
const MAX_EQP_COUNT = 500
const MAX_COMMENT_LENGTH = 90
const MAX_KNOX_ID_COUNT = 100
const MAX_KNOX_ID_LENGTH = 128
const KNOX_ID_PATTERN = /^[A-Za-z0-9._-]+$/

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
  return text.includes("@") ? text.slice(0, text.indexOf("@")) : text
}

function formatDatabaseTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function normalizeDatabaseTimestamp(value) {
  const text = normalizeText(value)
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)
  return match ? `${match[1]} ${match[2]}` : text
}

async function readJsonBody(req) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > 1024 * 1024) throw new TypeError("The request payload is too large.")
  }
  if (!body.trim()) return {}
  try {
    const value = JSON.parse(body)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError()
    return value
  } catch {
    throw new TypeError("The request JSON is invalid.")
  }
}

export function buildMyEqpRegistrationPayload(body, knoxId) {
  const line = normalizeText(body?.line)
  const sdwt = normalizeText(body?.sdwt)
  const prcGroup = normalizeText(body?.prcGroup)
  const eqps = uniqueTextValues(body?.eqps)
  const periode = Number(body?.periode)
  const defaultKnoxId = normalizeKnoxId(knoxId)
  const requestedKnoxIds = Array.isArray(body?.knoxIds) && body.knoxIds.length
    ? body.knoxIds
    : [defaultKnoxId]
  const knoxIds = Array.from(new Set(requestedKnoxIds.map(normalizeKnoxId).filter(Boolean)))
  const comment = String(body?.comment ?? "").trim()
  const isPublic = false

  if (!line) throw new TypeError("Line Name is required.")
  if (!sdwt) throw new TypeError("SDWT is required.")
  if (!prcGroup) throw new TypeError("PRC Group is required.")
  if (!eqps.length || eqps.length > MAX_EQP_COUNT) {
    throw new TypeError("Select between 1 and 500 EQPs.")
  }
  if (!Number.isSafeInteger(periode) || periode < 1 || periode > 2147483647) {
    throw new TypeError("The monitoring period must be a positive integer.")
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    throw new TypeError("Comment must be no more than 90 characters.")
  }
  if (!knoxIds.length || knoxIds.length > MAX_KNOX_ID_COUNT) {
    throw new TypeError("Select between 1 and 100 recipients.")
  }
  if (knoxIds.some((value) => value.length > MAX_KNOX_ID_LENGTH || !KNOX_ID_PATTERN.test(value))) {
    throw new TypeError("The knox_id format is invalid.")
  }

  return {
    line,
    sdwt,
    prcGroup,
    eqps,
    execDate: formatDatabaseTimestamp(),
    periode,
    comment,
    knoxId: knoxIds[0],
    knoxIds,
    isPublic,
  }
}

export function groupMyEqpRegistrationRecords(records, nowMs = Date.now()) {
  const groups = new Map()

  records.forEach((record) => {
    const normalized = {
      line: normalizeText(record?.line),
      sdwt: normalizeText(record?.sdwt),
      prcGroup: normalizeText(record?.prc_group),
      eqp: normalizeText(record?.eqp),
      execDate: normalizeDatabaseTimestamp(record?.exec_date),
      periode: Number(record?.periode),
      comment: String(record?.comment ?? ""),
      knoxId: normalizeText(record?.knox_id),
      isPublic: Number(record?.is_public) === 1,
    }
    if (!normalized.line || !normalized.sdwt || !normalized.prcGroup || !normalized.eqp) return

    const groupKey = [
      normalized.line,
      normalized.sdwt,
      normalized.prcGroup,
      normalized.execDate,
      normalized.periode,
      normalized.comment,
      normalized.knoxId,
      normalized.isPublic,
    ].join("\u0000")
    const group = groups.get(groupKey) ?? { ...normalized, eqps: [] }
    if (!group.eqps.includes(normalized.eqp)) group.eqps.push(normalized.eqp)
    groups.set(groupKey, group)
  })

  return Array.from(groups.values()).map((group) => {
    group.eqps.sort((left, right) => left.localeCompare(right, "ko", { numeric: true }))
    const execDateMs = Date.parse(group.execDate.replace(" ", "T"))
    const expiresAtMs = execDateMs + group.periode * 24 * 60 * 60 * 1000
    return {
      id: [group.line, group.sdwt, group.prcGroup, group.execDate, group.periode, group.comment, group.knoxId, group.isPublic].join("|"),
      line: group.line,
      sdwt: group.sdwt,
      prcGroup: group.prcGroup,
      eqps: group.eqps,
      execDate: group.execDate,
      periode: group.periode,
      comment: group.comment,
      knoxId: group.knoxId,
      isPublic: group.isPublic,
      expiresAt: Number.isFinite(expiresAtMs) ? formatDatabaseTimestamp(new Date(expiresAtMs)) : "",
      active: Number.isFinite(expiresAtMs) && expiresAtMs > nowMs,
    }
  }).sort((left, right) => right.execDate.localeCompare(left.execDate))
}

function runRegistrationHelper(action, payload) {
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
        reject(new Error("My EQP 기준정보 저장 시간이 초과되었습니다."))
        return
      }

      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch {
        reject(new Error("Save MY EQP 응답을 해석하지 못했습니다."))
        return
      }
      if (!result.ok) {
        reject(new Error("Unable to save MY EQP conditions."))
        return
      }
      resolvePromise(result)
    })
    child.stdin.on("error", reject)
    child.stdin.end(JSON.stringify(payload))
  })
}

export async function listMyEqpRegistrationRecords({ line, knoxId, activeOnly = false }, runHelper = runRegistrationHelper) {
  const result = await runHelper("list", {
    line: normalizeText(line),
    knoxId: normalizeText(knoxId),
    activeOnly: Boolean(activeOnly),
  })
  return Array.isArray(result.records) ? result.records : []
}

export async function handleMyEqpRegistrationRequest(
  req,
  res,
  url,
  {
    mappingReader = readLineMapping,
    resolveUser = resolveCurrentUser,
    runHelper = runRegistrationHelper,
    referenceReader = readMyEqpReferenceRows,
  } = {},
) {
  if (!new Set(["GET", "POST", "DELETE"]).has(req.method)) {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  try {
    const mapping = await requireLineMapping(mappingReader)

    const userId = (await resolveUser(getRemoteIp(req))).knoxId

    if (req.method === "GET") {
      const line = normalizeText(url.searchParams.get("line"))
      if (!line) {
        sendJson(res, 400, { ok: false, error: "Line Name is required." })
        return
      }
      assertKnownMappingLine(mapping, line)
      const activeOnly = url.searchParams.get("activeOnly") === "true"
      const records = await listMyEqpRegistrationRecords({ line, knoxId: userId, activeOnly }, runHelper)
      sendJson(res, 200, {
        ok: true,
        registrations: groupMyEqpRegistrationRecords(records).map(({ knoxId, ...registration }) => ({
          ...registration,
          ownedByCurrentUser: knoxId === userId,
        })),
      })
      return
    }

    if (req.headers["sec-fetch-site"] === "cross-site") throw Object.assign(new TypeError("Submit MY EQP changes from this site."), { status: 403 })
    if (req.headers.origin) {
      let origin
      try { origin = new URL(req.headers.origin) } catch { /* invalid origin */ }
      if (!origin || !["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.host) {
        throw Object.assign(new TypeError("Submit MY EQP changes from this site."), { status: 403 })
      }
    }
    if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw new TypeError("The request JSON is invalid.")
    const body = await readJsonBody(req)
    if (req.method === "DELETE") {
      const payload = buildMyEqpRegistrationPayload({
        ...body,
        eqps: body.eqps,
        periode: body.periode,
        knoxIds: [userId],
      }, userId)
      assertKnownMappingSdwts(mapping, { line: payload.line, sdwts: [payload.sdwt] })
      payload.isPublic = body.isPublic === true
      payload.execDate = normalizeDatabaseTimestamp(body.execDate)
      if (!payload.execDate) throw new TypeError("The registration time is required.")
      const result = await runHelper("delete", payload)
      sendJson(res, 200, result)
      return
    }

    const payload = buildMyEqpRegistrationPayload(body, userId)
    assertKnownMappingSdwts(mapping, { line: payload.line, sdwts: [payload.sdwt] })
    const referenceRows = filterMyEqpReferenceRowsBySdwt(await referenceReader(), [payload.sdwt,
      ...Object.keys(mapping.line_mapping).filter(key => mapping.line_mapping[key] === payload.line
        && (mapping.sdwt_mapping[key] ?? key) === payload.sdwt),
    ])
    const allowedEqps = new Set(referenceRows.filter(row => row.prc_group === payload.prcGroup)
      .map(row => `${row.main}_${row.disp_name}`))
    if (payload.eqps.some(eqp => !allowedEqps.has(eqp))) throw new TypeError("The selected EQP does not match the reference data.")
    const result = await runHelper("insert", payload)
    sendJson(res, 200, { ...result, knoxId: userId, knoxIds: payload.knoxIds })
  } catch (error) {
    if (sendCurrentUserError(res, error)) return
    if (error instanceof TypeError) {
      sendJson(res, error.status ?? 400, { ok: false, error: error.message })
      return
    }
    const mappingUnavailable = error.code === MAPPING_CONFIG_UNAVAILABLE_CODE
    const mappingMismatch = error.code === MAPPING_SCOPE_MISMATCH_CODE
    sendJson(res, mappingUnavailable ? 503 : mappingMismatch ? 400 : 500, createSafeApiError({
      code: mappingUnavailable
        ? MAPPING_CONFIG_UNAVAILABLE_CODE
        : mappingMismatch ? MAPPING_SCOPE_MISMATCH_CODE : "MY_EQP_REGISTRATION_REQUEST_FAILED",
      message: mappingUnavailable
        ? "MY EQP reference mappings are unavailable."
        : mappingMismatch
          ? "The selected Line and SDWT do not match the reference data."
          : "Unable to process the MY EQP request.",
      scope: "my-eqp-registration",
    }))
  }
}
