export function getDashboardLatestDate(dashboardPayload) {
  const latestDate = dashboardPayload?.latestDate
  return typeof latestDate === "string" ? latestDate.trim() : ""
}

export function formatDashboardLatestDate(dashboardPayload) {
  const latestDate = getDashboardLatestDate(dashboardPayload)
  if (!latestDate) return ""

  const [date, time] = latestDate.split(" ")
  return time ? `${date.replaceAll("-", ".")} ${time}` : date.replaceAll("-", ".")
}
