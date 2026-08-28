import { stat } from "node:fs/promises"
import { join, resolve } from "node:path"

import {
  SPIDER_DATA_PATH_NAMES,
  SPIDER_DATA_PATH_TEMPLATES,
} from "../src/config/spiderDataPaths.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

export const commonalityRootPath = process.env.COMMONALITY_ROOT_PATH
  ?? SPIDER_DATA_PATH_TEMPLATES.commonalityRoot
export const commonalityPathTableRootPath = process.env.COMMONALITY_PATH_TABLE_ROOT
  ?? SPIDER_DATA_PATH_TEMPLATES.commonalityPathTableRoot
export const latestCommonalityPathName = SPIDER_DATA_PATH_NAMES.latestCommonality

export function getCommonalityLatestDate(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("동일성 기준 날짜가 올바르지 않습니다.")
  }
  const pad = (value) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function getLatestCommonalityPath(
  rootPath = commonalityPathTableRootPath,
  now = new Date(),
) {
  const normalizedRootPath = resolve(rootPath)
  const latestDate = getCommonalityLatestDate(now)
  const path = join(normalizedRootPath, latestDate)
  try {
    if (!(await stat(path)).isFile()) throw new Error("not a file")
  } catch {
    const error = new Error(
      `동일성 오늘 날짜 경로 테이블을 찾지 못했습니다: ${path}`,
    )
    error.code = "COMMONALITY_PATH_TABLE_NOT_FOUND"
    throw error
  }

  return {
    name: latestCommonalityPathName,
    path,
    date: latestDate,
  }
}

export async function handleLatestCommonalityPathRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
    })
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const payload = await getLatestCommonalityPath()
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(payload))
  } catch (error) {
    const notFound = error.code === "COMMONALITY_PATH_TABLE_NOT_FOUND"
    const statusCode = notFound ? 404 : 500
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(createSafeApiError({
      code: notFound
        ? "COMMONALITY_LATEST_DATE_NOT_FOUND"
        : "COMMONALITY_LATEST_PATH_LOAD_FAILED",
      message: notFound
        ? "동일성 최신날짜 데이터가 없습니다."
        : "동일성 최신날짜 경로를 확인하지 못했습니다.",
      scope: "latest-commonality-path",
    })))
  }
}
