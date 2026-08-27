export const HISTORY_DB_WRITE_PREFIX = "[history-db-write]"
export const HISTORY_DB_ATTEMPT_PREFIX = "[history-db-attempt]"

export function logHistoryDbAttempt(payload, logger = console.info) {
  logger(`${HISTORY_DB_ATTEMPT_PREFIX} ${JSON.stringify(payload)}`)
  return payload
}

export function forwardHistoryDbWriteOutput(chunk, logger = console.info) {
  String(chunk ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${HISTORY_DB_WRITE_PREFIX} `))
    .forEach((line) => logger(line))
}

export function attachHistoryDbWriteLogger(child, logger = console.info) {
  let pending = ""
  child.stderr?.on("data", (chunk) => {
    const lines = `${pending}${String(chunk)}`.split(/\r?\n/)
    pending = lines.pop() ?? ""
    forwardHistoryDbWriteOutput(lines.join("\n"), logger)
  })
  child.stderr?.on("end", () => {
    forwardHistoryDbWriteOutput(pending, logger)
    pending = ""
  })
}
