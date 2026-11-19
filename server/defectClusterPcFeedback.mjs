import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"

// 몰림PC 판정 피드백("몰림PC 맞음"/"몰림PC 아님")을 scripts/defect_cluster_pc_feedback.py로 DB에 저장한다.
const helperPath = fileURLToPath(new URL("../scripts/defect_cluster_pc_feedback.py", import.meta.url))
export const FEEDBACK_SAVE_ERROR = "Unable to save the clustered PC verdict."
const storageError = () => new Error(FEEDBACK_SAVE_ERROR)

export function runClusterPcFeedback(payload, { execute = execFile } = {}) {
  return new Promise((resolve, reject) => {
    const child = execute("python3", ["-B", helperPath], { timeout: 10_000, maxBuffer: 64 * 1024 }, (error, stdout) => {
      if (error) return reject(storageError())
      try {
        const result = JSON.parse(stdout)
        if (result?.ok !== true) throw storageError()
        resolve({ ok: true })
      } catch { reject(storageError()) }
    })
    child.stdin.on("error", () => reject(storageError()))
    child.stdin.end(JSON.stringify(payload))
  })
}
