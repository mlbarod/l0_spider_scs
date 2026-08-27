export function logHistoryRequest({ endpoint, method = "POST", body }, logger = console.info) {
  const payload = {
    endpoint,
    method,
    body,
  }
  logger(`[history-db-request] ${JSON.stringify(payload)}`)
  return payload
}

export function logHistoryDbFinal({ table, operation, record }, logger = console.info) {
  const payload = {
    table,
    operation,
    record,
  }
  logger(`[history-db-final] ${JSON.stringify(payload)}`)
  return payload
}
