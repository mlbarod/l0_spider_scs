const UNDER_CONSTRUCTION_APPS = Object.freeze({
  "common-commonality": Object.freeze({
    title: "공통부 동일성 이상감지",
    category: "Common Matching",
  }),
  "fdc-hard-limit": Object.freeze({
    title: "FDC Hard Limit추천",
    category: "Limit",
  }),
  "defect-spider": Object.freeze({
    title: "Defect SPIDER",
    category: "Defect",
  }),
  "l1-spider": Object.freeze({
    title: "L1 SPIDER",
    category: "Level 1",
  }),
  "l3-spider": Object.freeze({
    title: "L3 SPIDER",
    category: "Level 3",
  }),
})

export function getUnderConstructionApp(appId) {
  return UNDER_CONSTRUCTION_APPS[appId] ?? null
}

export function getUnderConstructionPath(appId) {
  if (!getUnderConstructionApp(appId)) {
    throw new Error(`Unknown under-construction app: ${appId}`)
  }

  return `/under-construction/${appId}`
}
