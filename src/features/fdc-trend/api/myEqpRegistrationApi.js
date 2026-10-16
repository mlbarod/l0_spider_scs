import { getApiErrorMessage } from "./errorMessage.js"

export async function createMyEqpRegistration({
  line,
  sdwt,
  prcGroup,
  eqps,
  periode,
  comment,
  isPublic,
  knoxIds,
}) {
  const response = await fetch("/api/my-eqp-registration", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ line, sdwt, prcGroup, eqps, periode, comment, isPublic, knoxIds }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to save MY EQP conditions."))
  }
  return payload
}

export async function fetchMyEqpRegistrations({ line, activeOnly = false }) {
  const searchParams = new URLSearchParams({ line })
  if (activeOnly) searchParams.set("activeOnly", "true")
  const response = await fetch(`/api/my-eqp-registration?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load MY EQP registrations."))
  }
  return Array.isArray(payload.registrations) ? payload.registrations : []
}

export async function deleteMyEqpRegistration(registration) {
  const response = await fetch("/api/my-eqp-registration", {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(registration),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to delete MY EQP conditions."))
  }
  return payload
}
