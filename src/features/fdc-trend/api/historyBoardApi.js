import { getApiErrorMessage } from "./errorMessage.js"

async function request(path, { method = "GET", body, signal } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    if (error?.name === "AbortError") throw error
    throw Object.assign(new Error("Unable to connect to the server."), { code: "NETWORK_ERROR" })
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok !== true) {
    throw Object.assign(new Error(getApiErrorMessage(payload, "Unable to process the board request.")), { code: payload?.code })
  }
  return payload
}

export function fetchHistoryPosts({ page = 1, status = "", search = "", line = "", sdwt = "", signal } = {}) {
  const query = new URLSearchParams({ page: String(page), status, search, line, sdwt })
  return request(`/api/history-board?${query}`, { signal })
}

export function fetchHistoryPost(id, signal) {
  return request(`/api/history-board/${encodeURIComponent(id)}`, { signal })
}

export function createHistoryPost({ entryType, title, details, comment, app, lineId, updateDate, sdwt, filePath, image, requestId }) {
  return request("/api/history-board", {
    method: "POST",
    body: { entryType, title, details, comment, app, lineId, updateDate, sdwt, filePath, image, requestId },
  })
}

export function updateHistoryPostStatus(id, input) {
  return request(`/api/history-board/${encodeURIComponent(id)}`, { method: "PATCH", body: input })
}

export function deleteHistoryPost(id) {
  return request(`/api/history-board/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export function historyPostImageUrl(id) {
  return `/api/history-board/${encodeURIComponent(id)}/image`
}
