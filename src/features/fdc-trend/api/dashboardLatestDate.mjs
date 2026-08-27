export function getDashboardLatestDate(dashboardPayload) {
  const detailPath = dashboardPayload?.sourcePaths?.detail
  if (typeof detailPath !== "string") return ""

  return detailPath
    .trim()
    .replace(/\/+$/, "")
    .split("/")
    .at(-1)
    ?.trim() ?? ""
}

export function formatDashboardLatestDate(dashboardPayload) {
  const latestDate = getDashboardLatestDate(dashboardPayload)
  if (!latestDate) return ""

  const [date, time] = latestDate.split(" ")
  return time ? `${date.replaceAll("-", ".")} ${time}` : date.replaceAll("-", ".")
}
