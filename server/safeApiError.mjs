import { randomUUID } from "node:crypto"

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/
const ERROR_SCOPE_PATTERN = /^[a-z0-9-]{2,63}$/

export function createSafeApiError({ code, message, scope, logger = console.error }) {
  if (!ERROR_CODE_PATTERN.test(code)) throw new Error("The safe API error code format is invalid.")
  if (!ERROR_SCOPE_PATTERN.test(scope)) throw new Error("The safe API error scope format is invalid.")
  const safeMessage = String(message ?? "").trim()
  if (!safeMessage) throw new Error("A safe API error message is required.")

  const requestId = randomUUID()
  logger(`[api-error] scope=${scope} code=${code} requestId=${requestId}`)
  return {
    ok: false,
    code,
    error: safeMessage,
    requestId,
  }
}
