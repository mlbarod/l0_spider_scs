import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  getCommonalityLatestDate,
  getLatestCommonalityPath,
  latestCommonalityPathName,
} from "./latestCommonalityPath.mjs"

test("현재 날짜를 YYYY-MM-DD 형식으로 생성한다", () => {
  assert.equal(
    getCommonalityLatestDate(new Date(2026, 7, 28, 15, 30, 0)),
    "2026-08-28",
  )
})

test("접속 날짜를 포함하는 유효 파일 중 가장 최신 시각의 경로 테이블을 반환한다", async (context) => {
  const rootPath = await mkdtemp(join(tmpdir(), "commonality-latest-"))
  context.after(() => rm(rootPath, { recursive: true, force: true }))
  const now = new Date(2026, 7, 28, 15, 30, 0)
  const expectedPath = join(rootPath, "2026-08-28 15:20:30")
  await Promise.all([
    writeFile(join(rootPath, "2026-08-28 08:00:00"), "parquet"),
    writeFile(expectedPath, "parquet"),
    writeFile(join(rootPath, "2026-08-27 23:59:59"), "parquet"),
    writeFile(join(rootPath, "2026-08-28 25:00:00"), "invalid"),
    writeFile(join(rootPath, "prefix-2026-08-28 16:00:00"), "invalid"),
    mkdir(join(rootPath, "2026-08-28 16:00:00")),
  ])

  assert.deepEqual(await getLatestCommonalityPath(rootPath, now), {
    name: latestCommonalityPathName,
    path: expectedPath,
    date: "2026-08-28",
  })
})

test("오늘 날짜 경로 테이블이 없으면 명확한 오류를 반환한다", async (context) => {
  const rootPath = await mkdtemp(join(tmpdir(), "commonality-empty-"))
  context.after(() => rm(rootPath, { recursive: true, force: true }))

  await assert.rejects(
    getLatestCommonalityPath(rootPath, new Date(2026, 7, 28, 15, 30, 0)),
    (error) => (
      error.code === "COMMONALITY_PATH_TABLE_NOT_FOUND"
      && error.message.includes("2026-08-28")
    ),
  )
})
