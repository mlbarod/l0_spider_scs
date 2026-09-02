import { getApiErrorMessage } from "./errorMessage.js"

async function readPayload(response) {
  return response.json().catch(() => ({}))
}

export async function createMailingRegistration({ knoxId, knoxIds, sdwts }) {
  const recipientKnoxIds = Array.isArray(knoxIds) && knoxIds.length
    ? knoxIds
    : knoxId
      ? [knoxId]
      : []
  const primaryKnoxId = knoxId || recipientKnoxIds[0] || ""
  const response = await fetch("/api/mailing-registration", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ knoxId: primaryKnoxId, knoxIds: recipientKnoxIds, sdwts }),
  })
  const payload = await readPayload(response)

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to save Mailing reference data."))
  }
  return payload
}

export async function deleteMailingRegistrationLine({ knoxId, line, sdwts }) {
  const response = await fetch("/api/mailing-registration", {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ knoxId, line, sdwts }),
  })
  const payload = await readPayload(response)

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to delete the Mailing Line filters."))
  }
  return payload
}

export async function fetchMailingRegistrations({ knoxId }) {
  const searchParams = new URLSearchParams({ knoxId })
  const response = await fetch(`/api/mailing-registration?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await readPayload(response)

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load registered Mailing filters."))
  }
  return Array.isArray(payload.registrations) ? payload.registrations : []
}
