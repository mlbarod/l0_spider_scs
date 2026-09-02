const UNDER_CONSTRUCTION_APPS = Object.freeze({
  "common-anomaly": Object.freeze({
    title: "Common Area Anomaly Detection",
    category: "Common",
  }),
  "common-commonality": Object.freeze({
    title: "Common Area Similarity Detection",
    category: "Common Matching",
  }),
  "fdc-hard-limit": Object.freeze({
    title: "FDC Hard Limit Recommendations",
    category: "Limit",
  }),
  "my-eqp-registration": Object.freeze({
    title: "MY EQP Registration",
    category: "Registration",
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
