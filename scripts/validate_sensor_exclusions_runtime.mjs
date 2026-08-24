import { readFile } from "node:fs/promises"

import {
  SENSOR_EXCLUSION_APP_KEYS,
  normalizeSensorExclusionConfig,
  sensorExclusionConfigPath,
} from "../server/sensorExclusionConfig.mjs"

const configPath = String(process.argv[2] ?? sensorExclusionConfigPath).trim()

if (!configPath) {
  console.error("검증할 sensor 제외 JSON 경로가 필요합니다.")
  process.exitCode = 1
} else {
  try {
    const payload = JSON.parse(await readFile(configPath, "utf8"))
    const config = normalizeSensorExclusionConfig(payload)
    const counts = Object.fromEntries(
      SENSOR_EXCLUSION_APP_KEYS.map((appKey) => [appKey, config.apps[appKey].contains.length]),
    )
    console.log(JSON.stringify({ ok: true, termCounts: counts }))
  } catch {
    console.error("sensor 제외 설정 검증에 실패했습니다.")
    process.exitCode = 1
  }
}
