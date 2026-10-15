import { getApiErrorMessage } from "./errorMessage.js"

async function currentUserRequest(options) {
  const response = await fetch("/api/current-user", options)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw Object.assign(new Error(getApiErrorMessage(payload, "Unable to identify the current user.")), {
      code: payload.code,
    })
  }

  return payload
}

export function fetchCurrentUser() {
  return currentUserRequest({ headers: { Accept: "application/json" }, cache: "no-store" })
}

export function registerCurrentUser(knoxId) {
  return currentUserRequest({
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ knoxId }),
  })
}
