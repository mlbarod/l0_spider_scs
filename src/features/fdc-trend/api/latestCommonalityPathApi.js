import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchLatestCommonalityPath() {
  const response = await fetch("/api/latest-commonality-path", {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to determine the latest similarity path."))
  }

  return payload
}
