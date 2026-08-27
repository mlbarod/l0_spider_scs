import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchCurrentUser() {
  const response = await fetch("/api/current-user", {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "접속 IP를 확인하지 못했습니다."))
  }

  return payload
}
