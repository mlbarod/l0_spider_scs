import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import test from "node:test"
import { handleCurrentUserRequest } from "../../server/currentUser.mjs"
import { handleHitHistoryRequest } from "../../server/hitHistory.mjs"
import { handlePassHistoryRequest } from "../../server/passHistory.mjs"
import { handleClickedCategoryHistoryRequest } from "../../server/clickedCategoryHistory.mjs"

function request(method = "GET", body = {}) {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method, url: "/api/test", headers: { host: "spider.test", "content-type": "application/json" },
    socket: { remoteAddress: "192.0.2.10" },
  })
}
function response() {
  return { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
}

// Replace only the Python DB driver. Exercise real Node handlers and helper subprocesses.
// All files/configuration are synthetic and isolated under a temporary directory.
const driver = `
import json
import os
from pathlib import Path
root = Path(__file__).parent
class Connection:
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def cursor(self): return self
    def commit(self): pass
    def rollback(self): pass
    def execute(self, sql, params):
        if os.environ.get("CURRENT_USER_TEST_DB_FAILURE") == "1":
            raise RuntimeError("synthetic private connection details")
        state_path = root / "users.json"
        users = json.loads(state_path.read_text()) if state_path.exists() else {}
        if sql.startswith("INSERT INTO \\x60user_ip_mapping\\x60"):
            users.setdefault(params[0], params[1])
            state_path.write_text(json.dumps(users))
        elif sql.startswith("SELECT \\x60knox_id\\x60"):
            self.row = (users[params[0]],) if params[0] in users else None
        elif "INSERT INTO \\x60hit_history\\x60" in sql:
            (root / "history.json").write_text(json.dumps(params))
        else:
            raise RuntimeError("Unexpected synthetic SQL")
    def fetchone(self): return self.row

def connect(**kwargs):
    assert kwargs["host"] == "synthetic.invalid"
    return Connection()
`

test("실제 helper 경로에서 최초 등록·재조회·이력 ID와 미등록/장애 차단을 검증한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "spider-current-user-test-"))
  const keys = ["DB_INFO_PATH", "PYTHONPATH", "CURRENT_USER_TEST_DB_FAILURE"]
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    await writeFile(join(root, "pymysql.py"), driver)
    process.env.DB_INFO_PATH = join(root, "synthetic.pkl")
    process.env.PYTHONPATH = root
    delete process.env.CURRENT_USER_TEST_DB_FAILURE
    execFileSync("python3", ["-B", "-c", "import os,pickle; pickle.dump(dict(DB_HOST='synthetic.invalid',DB_PORT=3306,DB_NAME='synthetic',DB_USER='synthetic',DB_PASSWORD='synthetic'),open(os.environ['DB_INFO_PATH'],'wb'))"])
    for (const handler of [handleHitHistoryRequest, handlePassHistoryRequest, handleClickedCategoryHistoryRequest]) {
      const res = response()
      await handler(request("POST", { knoxId: "forged.user" }), res)
      assert.equal(res.status, 428)
      assert.equal(res.body.code, "USER_REGISTRATION_REQUIRED")
    }
    let res = response()
    await handleCurrentUserRequest(request("POST", { knoxId: "registered.user", ipAddress: "192.0.2.99" }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body.ipAddress, "192.0.2.10")
    res = response()
    await handleCurrentUserRequest(request(), res)
    assert.equal(res.body.knoxId, "registered.user")
    assert.equal(res.body.registrationRequired, false)
    res = response()
    await handleHitHistoryRequest(request("POST", {
      knoxId: "forged.user", lineId: "L1", sdwt: "TEAM", updateDate: "2026-10-15",
      filePath: "/synthetic/chart", execDate: "2026-10-15 10:00:00",
    }), res)
    assert.equal(res.status, 200)
    const saved = JSON.parse(await readFile(join(root, "history.json"), "utf8"))
    assert.equal(saved[4], "registered.user")
    process.env.CURRENT_USER_TEST_DB_FAILURE = "1"
    for (const handler of [handleCurrentUserRequest, handleHitHistoryRequest, handlePassHistoryRequest, handleClickedCategoryHistoryRequest]) {
      res = response()
      await handler(request("POST", { knoxId: "forged.user" }), res)
      assert.equal(res.status, 503)
      assert.equal(res.body.code, "CURRENT_USER_DB_FAILED")
      assert.doesNotMatch(JSON.stringify(res.body), /synthetic private/)
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    await rm(root, { recursive: true, force: true })
  }
})
