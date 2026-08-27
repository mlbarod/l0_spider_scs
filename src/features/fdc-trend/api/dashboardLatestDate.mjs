export function getDashboardLatestDate(dashboardPayload) {
  const latestDate = dashboardPayload?.latestDate
  return typeof latestDate === "string" ? latestDate.trim() : ""
}
