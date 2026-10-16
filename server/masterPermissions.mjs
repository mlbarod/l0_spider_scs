export function isMasterUser(knoxId) {
  if (typeof knoxId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(knoxId)) return false
  return (process.env.SPIDER_MASTER_KNOX_IDS ?? "")
    .split(",").map(value => value.trim()).filter(Boolean).includes(knoxId)
}
