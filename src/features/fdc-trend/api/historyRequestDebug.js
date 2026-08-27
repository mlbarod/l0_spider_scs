export function logHistoryRequest({ endpoint, method = "POST", body }, logger = console.info) {
  const payload = {
    endpoint,
    method,
    body,
  }
  logger(`[history-db-request] ${JSON.stringify(payload)}`)
  return payload
}
