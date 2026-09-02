import { readFile } from "node:fs/promises"

import { SPIDER_DATA_PATH_TEMPLATES } from "../src/config/spiderDataPaths.mjs"
import { validateLineMappingPayload } from "../src/features/fdc-trend/api/mappingContract.mjs"
import { createSafeApiError } from "./safeApiError.mjs"
import {
  getDataConnectionCapabilities,
} from "./dataConnections.mjs"

export const mappingConfigPath = process.env.MAPPING_CONFIG_PATH
  ?? SPIDER_DATA_PATH_TEMPLATES.mappingConfig

export const MAPPING_CONFIG_UNAVAILABLE_CODE = "MAPPING_CONFIG_UNAVAILABLE"
export const MAPPING_SCOPE_MISMATCH_CODE = "MAPPING_SCOPE_MISMATCH"

function normalizeText(value) {
  return String(value ?? "").trim()
}

function createMappingError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export async function readLineMapping(configPath = mappingConfigPath) {
  const configText = await readFile(configPath, "utf8")
  const config = JSON.parse(configText)
  const { line_mapping: lineMapping, sdwt_mapping: sdwtMapping } = validateLineMappingPayload(config)

  return {
    line_mapping: lineMapping,
    sdwt_mapping: sdwtMapping,
    source_path: configPath,
  }
}

export async function requireLineMapping(mappingReader = readLineMapping) {
  try {
    return validateLineMappingPayload(await mappingReader())
  } catch {
    throw createMappingError(
      MAPPING_CONFIG_UNAVAILABLE_CODE,
      "Reference mappings are unavailable.",
    )
  }
}

export function buildMappingConfigResponse(mapping, environment = process.env) {
  return {
    ...mapping,
    capabilities: getDataConnectionCapabilities(environment),
  }
}

export function assertKnownMappingLine(mapping, requestedLine) {
  const line = normalizeText(requestedLine)
  if (!line || !Object.values(mapping.line_mapping).some((value) => normalizeText(value) === line)) {
    throw createMappingError(MAPPING_SCOPE_MISMATCH_CODE, "The reference mapping scope does not match.")
  }
}

export function assertKnownMappingLineSdwt(mapping, { line, pathSdwt }) {
  const normalizedLine = normalizeText(line)
  const normalizedPathSdwt = normalizeText(pathSdwt)
  if (
    !normalizedLine
    || !normalizedPathSdwt
    || normalizeText(mapping.line_mapping[normalizedPathSdwt]) !== normalizedLine
  ) {
    throw createMappingError(MAPPING_SCOPE_MISMATCH_CODE, "The reference mapping scope does not match.")
  }
}

export function assertKnownMappingSdwts(mapping, { line = "", sdwts }) {
  const normalizedLine = normalizeText(line)
  const allowedSdwts = new Set(Object.entries(mapping.line_mapping)
    .filter(([, mappedLine]) => !normalizedLine || normalizeText(mappedLine) === normalizedLine)
    .map(([pathSdwt]) => normalizeText(mapping.sdwt_mapping[pathSdwt] ?? pathSdwt)))
  const requestedSdwts = Array.isArray(sdwts) ? sdwts.map(normalizeText).filter(Boolean) : []

  if (!requestedSdwts.length || requestedSdwts.some((sdwt) => !allowedSdwts.has(sdwt))) {
    throw createMappingError(MAPPING_SCOPE_MISMATCH_CODE, "The reference mapping scope does not match.")
  }
}

export async function handleMappingConfigRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
    })
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const payload = buildMappingConfigResponse(await readLineMapping())
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    })
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(payload))
  } catch {
    res.writeHead(500, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    res.end(JSON.stringify(createSafeApiError({
      code: "MAPPING_CONFIG_LOAD_FAILED",
      message: "Unable to load reference mappings.",
      scope: "mapping-config",
    })))
  }
}
