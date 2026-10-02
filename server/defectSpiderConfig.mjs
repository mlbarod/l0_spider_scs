import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"

const configPath = new URL("../config/defect-spider.env", import.meta.url)

export function resolveDefectFailListPath(line, environment) {
  const configError = (message) => {
    const error = new Error(`DEFECT_SPIDER_LINE_DEVICES: ${message}`)
    error.code = "DEFECT_CONFIG_INVALID"
    return error
  }
  let source = String(environment.DEFECT_SPIDER_LINE_DEVICES ?? "").trim()
  // 환경변수 입력 UI에서는 .env와 달리 바깥 작은따옴표가 값에 남을 수 있다.
  if (source.startsWith("'") && source.endsWith("'")) source = source.slice(1, -1).trim()
  if (!source) throw configError("설정값이 비어 있습니다. Line별 device를 지정하세요.")
  let devices
  try {
    devices = JSON.parse(source)
  } catch {
    throw configError('JSON 문법이 올바르지 않습니다. {"라인명":"디바이스"} 형식으로 입력하세요.')
  }
  const selectedLine = String(line ?? "").trim()
  if (!devices || typeof devices !== "object" || Array.isArray(devices)) {
    throw configError('Line을 키로 하는 JSON 객체가 필요합니다. {"라인명":"디바이스"} 형식으로 입력하세요.')
  }
  if (!Object.hasOwn(devices, selectedLine)) {
    throw configError(`선택한 Line ${JSON.stringify(selectedLine)}의 device가 등록되지 않았습니다. 이 Line 값을 키로 추가하세요.`)
  }
  if (typeof devices[selectedLine] !== "string" || !devices[selectedLine].trim()) {
    throw configError(`선택한 Line ${JSON.stringify(selectedLine)}의 device는 비어 있지 않은 문자열이어야 합니다.`)
  }
  const segments = [selectedLine, devices[selectedLine].trim()]
  if (segments.some((value) => !value || value === "." || value === ".." || /[/\\]/.test(value) || value.includes("\0"))) {
    throw configError("Line과 device에는 폴더 이름만 사용할 수 있습니다. 경로 구분자(/, \\), 점(.)·상위 경로(..), 빈 값은 사용할 수 없습니다.")
  }
  return `/appdata/hadoop/code/eads/${segments.join("/")}/fail_list.parquet`
}

export function getDefectFailListPath(line, environment = process.env) {
  const config = parseEnv(readFileSync(configPath, "utf8"))
  try {
    return resolveDefectFailListPath(line, { ...config, ...environment })
  } catch (error) {
    if (error.code === "DEFECT_CONFIG_INVALID") {
      error.message += environment.DEFECT_SPIDER_LINE_DEVICES !== undefined
        ? " 현재 서버 환경변수가 config/defect-spider.env보다 우선 적용되고 있습니다."
        : " 적용 파일: config/defect-spider.env."
    }
    throw error
  }
}
