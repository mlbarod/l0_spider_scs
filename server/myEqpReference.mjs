import { readEqpReferenceRows } from "./eqpReference.mjs"

import { createSafeApiError } from "./safeApiError.mjs"

function sendJson(res, statusCode, payload, method = "GET") {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": statusCode === 200 ? "private, max-age=60" : "no-store",
  })
  res.end(method === "HEAD" ? undefined : JSON.stringify(payload))
}

export function normalizeMyEqpReferenceRows(rows) {
  if (!Array.isArray(rows)) return []

  return rows.map((row) => ({
    main: String(row?.main ?? "").trim(),
    disp_name: String(row?.disp_name ?? "").trim(),
    sdwt_prod: String(row?.sdwt_prod ?? "").trim(),
    prc_group: String(row?.prc_group ?? "").trim(),
  })).filter((row) => row.main && row.disp_name && row.sdwt_prod && row.prc_group)
}

export async function readMyEqpReferenceRows(filePath) {
  const { rows } = await readEqpReferenceRows(filePath)
  return normalizeMyEqpReferenceRows(rows)
}

export async function handleMyEqpReferenceRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
    })
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const rows = await readMyEqpReferenceRows()
    sendJson(res, 200, { ok: true, rows }, req.method)
  } catch {
    sendJson(res, 500, createSafeApiError({
      code: "MY_EQP_REFERENCE_LOAD_FAILED",
      message: "Unable to load MY EQP reference data.",
      scope: "my-eqp-reference",
    }), req.method)
  }
}
