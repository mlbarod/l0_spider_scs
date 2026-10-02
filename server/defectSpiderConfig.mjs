import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"

const configPath = new URL("../config/defect-spider.env", import.meta.url)

export function resolveDefectFailListPath(line, environment) {
  const configError = () => {
    const error = new Error("config/defect-spider.env의 DEFECT_SPIDER_LINE_DEVICES에 선택한 Line의 device를 JSON 형식으로 지정하세요.")
    error.code = "DEFECT_CONFIG_INVALID"
    return error
  }
  let devices
  try {
    devices = JSON.parse(environment.DEFECT_SPIDER_LINE_DEVICES ?? "{}")
  } catch {
    throw configError()
  }
  const selectedLine = String(line ?? "").trim()
  if (!devices || typeof devices !== "object" || Array.isArray(devices)
    || !Object.hasOwn(devices, selectedLine) || typeof devices[selectedLine] !== "string") {
    throw configError()
  }
  const segments = [selectedLine, devices[selectedLine].trim()]
  if (segments.some((value) => !value || value === "." || value === ".." || /[/\\]/.test(value) || value.includes("\0"))) {
    throw configError()
  }
  return `/appdata/hadoop/code/eads/${segments.join("/")}/fail_list.parquet`
}

export function getDefectFailListPath(line, environment = process.env) {
  const config = parseEnv(readFileSync(configPath, "utf8"))
  return resolveDefectFailListPath(line, { ...config, ...environment })
}
