import assert from "node:assert/strict"
import test from "node:test"
import { DEFECT_DEPO_FAIL_LIST_ROOT, DEFECT_FAIL_LIST_ROOT, getDefectFailListPath, resolveDefectFailListPath } from "./defectSpiderConfig.mjs"

const entry = (name, directory = true) => ({ name, isDirectory: () => directory })
const now = new Date("2026-10-30T15:01:00Z") // 한국시간 10월 31일 00:01

test("한국시간 오늘 폴더 중 최신 시각만 선택하고 다른 날짜·파일·잘못된 시각은 제외한다", () => {
  const entries = [
    entry("2026-10-30 23:59"), entry("2026-11-01 00:00"),
    entry("2026-10-31 09:00"), entry("2026-10-31 : 15:30"), entry("2026-10-31 12:00"),
    entry("2026-10-31 23:59", false), entry("2026-10-31 24:00"), entry("2026-10-31 15:60"),
    entry("2026-10-31"), entry("2026-10-31 20:00.backup"),
  ]
  assert.equal(resolveDefectFailListPath(entries, now), `${DEFECT_FAIL_LIST_ROOT}/2026-10-31 : 15:30/fail_list.parquet`)
  assert.equal(resolveDefectFailListPath([entry("2026-10-31 09:00")], now), `${DEFECT_FAIL_LIST_ROOT}/2026-10-31 09:00/fail_list.parquet`)
})

test("오늘 폴더가 없으면 과거 폴더를 대신 사용하지 않는다", () => {
  for (const entries of [[], [entry("2026-10-30 23:59")]]) {
    assert.throws(() => resolveDefectFailListPath(entries, now), { code: "DEFECT_LIST_UNAVAILABLE" })
  }
})

test("Line과 무관하게 지정한 루트를 조회하고 요청마다 새 날짜 폴더를 확인한다", async () => {
  let reads = 0
  const options = {
    now,
    readDirectory: async (root, options) => {
      assert.equal(root, DEFECT_FAIL_LIST_ROOT)
      assert.deepEqual(options, { withFileTypes: true })
      reads += 1
      return [entry(`2026-10-31 ${reads === 1 ? "09:00" : "15:30"}`)]
    },
  }
  assert.equal(await getDefectFailListPath("L1", options), `${DEFECT_FAIL_LIST_ROOT}/2026-10-31 09:00/fail_list.parquet`)
  assert.equal(await getDefectFailListPath("L2", options), `${DEFECT_FAIL_LIST_ROOT}/2026-10-31 15:30/fail_list.parquet`)
  await assert.rejects(getDefectFailListPath("L1", {
    now, readDirectory: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }) },
  }), { code: "EACCES" })
})

test("DEPO후 스탭은 fail_list_all_depo_scs 루트를, 그 외 값은 기존 관리스탭 루트를 조회한다", async () => {
  const roots = []
  const readDirectory = async (root) => { roots.push(root); return [entry("2026-10-31 09:00")] }
  assert.equal(await getDefectFailListPath("L1", { now, readDirectory, step: "depo" }),
    "/appdata/abnormal_trend/pic/defect/fail_list_all_depo_scs/2026-10-31 09:00/fail_list.parquet")
  await getDefectFailListPath("L1", { now, readDirectory })
  await getDefectFailListPath("L1", { now, readDirectory, step: "unknown" })
  assert.deepEqual(roots, [DEFECT_DEPO_FAIL_LIST_ROOT, DEFECT_FAIL_LIST_ROOT, DEFECT_FAIL_LIST_ROOT])
})
