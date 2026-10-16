import { getRemoteIp, resolveCurrentUser, sendCurrentUserError } from "./currentUser.mjs"
import { assertKnownMappingLine, readLineMapping, requireLineMapping } from "./mappingConfig.mjs"
import { listMyEqpRegistrationRecords } from "./myEqpRegistration.mjs"
import { readEqpReferenceRows } from "./eqpReference.mjs"
import { listPassHistoryRecords } from "./passHistory.mjs"
import { excludeSensorRows, readSensorExclusionConfig } from "./sensorExclusionConfig.mjs"
import { createSafeApiError } from "./safeApiError.mjs"
import {
  buildSelfEquipmentPayload, excludeRecentlySkippedRows, joinTeamErdRowsWithEqpReference,
  readTeamErdRows, scopeSelfEquipmentRows,
} from "./selfEquipmentData.mjs"

function normalizeMatch(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en-US").replace(/[^\p{L}\p{N}]/gu, "")
}

export function filterMyEqpRows(rows, registrations) {
  const eqps = new Set(registrations.map(record => normalizeMatch(String(record.eqp ?? "").replace(/\.png$/i, ""))))
  return rows.filter(row => eqps.has(normalizeMatch(String(row.eqp ?? "").replace(/\.png$/i, ""))))
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(payload))
}

export async function handleMyEqpEquipmentDataRequest(req, res, url, {
  resolveUser = resolveCurrentUser,
  mappingReader = readLineMapping,
  listRegistrations = listMyEqpRegistrationRecords,
  readRows = readTeamErdRows,
  readReference = readEqpReferenceRows,
  listPassRecords = listPassHistoryRecords,
  readExclusions = readSensorExclusionConfig,
} = {}) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" })
  try {
    const filters = Object.fromEntries(["line", "desc", "prcGroup", "eqpCh", "sensor", "chStep"].map(key => [key, url.searchParams.get(key)?.trim() ?? ""]))
    filters.priorities = url.searchParams.getAll("priority").map(value => value.trim()).filter(Boolean)
    const mapping = await requireLineMapping(mappingReader)
    assertKnownMappingLine(mapping, filters.line)
    const user = await resolveUser(getRemoteIp(req))
    const registrations = await listRegistrations({ line: filters.line, knoxId: user.knoxId, activeOnly: true })
    const sources = Object.entries(mapping.line_mapping).filter(([, line]) => line === filters.line)
      .map(([pathSdwt]) => ({ pathSdwt, registrations: registrations.filter(record =>
        [pathSdwt, mapping.sdwt_mapping[pathSdwt] ?? pathSdwt].some(sdwt => normalizeMatch(sdwt) === normalizeMatch(record.sdwt))),
      })).filter(source => source.registrations.length)
    const [{ rows: referenceRows }, exclusions, passRecords, dataSources] = await Promise.all([
      sources.length ? readReference() : { rows: [] },
      readExclusions(),
      sources.length ? listPassRecords({ lineId: filters.line }) : [],
      Promise.all(sources.map(async source => ({ ...source, ...await readRows({ line: filters.line, pathSdwt: source.pathSdwt }) }))),
    ])
    const registeredRows = dataSources.flatMap(source => filterMyEqpRows(
      scopeSelfEquipmentRows(joinTeamErdRowsWithEqpReference(source.rows, referenceRows), {
        line: filters.line, pathSdwt: source.pathSdwt, mapping,
      }), source.registrations,
    ))
    const availablePriorities = [...new Set(excludeSensorRows(registeredRows, exclusions, "selfEquipment").rows.map(row => row.priority).filter(Boolean))].sort()
    const visibleRows = excludeRecentlySkippedRows(registeredRows, passRecords)
    const sensorExclusion = excludeSensorRows(visibleRows, exclusions, "selfEquipment")
    const payload = buildSelfEquipmentPayload(sensorExclusion.rows, { ...filters, pathSdwt: "__MY_EQP__", sdwt: "MY EQP", includeAllSdwt: true })
    sendJson(res, 200, {
      ...payload,
      counts: { ...payload.counts, registeredEqps: new Set(registrations.map(row => row.eqp)).size,
        matchedRegistrationRows: registeredRows.length, excludedSkipRows: registeredRows.length - visibleRows.length,
        excludedSensorRows: sensorExclusion.excludedCount },
      availablePriorities,
    })
  } catch (error) {
    if (sendCurrentUserError(res, error)) return
    const mappingError = ["MAPPING_SCOPE_MISMATCH", "MAPPING_CONFIG_UNAVAILABLE"].includes(error.code)
    sendJson(res, error.code === "MAPPING_SCOPE_MISMATCH" ? 400 : error.code === "MAPPING_CONFIG_UNAVAILABLE" ? 503 : 500,
      createSafeApiError({ code: mappingError ? error.code : "MY_EQP_DATA_LOAD_FAILED", message: "Unable to load MY EQP anomaly data.", scope: "my-eqp-data" }))
  }
}
