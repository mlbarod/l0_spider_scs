import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchCurrentUser() {
  const response = await fetch("/api/current-user", {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to determine the client IP."))
  }

  return payload
}
