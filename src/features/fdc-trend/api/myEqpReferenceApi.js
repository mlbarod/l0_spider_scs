import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchMyEqpReference() {
  const response = await fetch("/api/my-eqp-reference", {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load MY EQP reference data."))
  }
  if (!Array.isArray(payload.rows)) {
    throw new Error("The MY EQP reference data format is invalid.")
  }

  return payload.rows
}
