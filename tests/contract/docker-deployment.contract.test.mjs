import assert from "node:assert/strict"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"

const readProjectFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")
const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

async function runRuntimeValidator(modulePath, configPath) {
  const previousArgv = process.argv
  const previousExitCode = process.exitCode
  const previousLog = console.log
  const previousError = console.error
  const stdout = []
  const stderr = []
  try {
    process.argv = [process.execPath, modulePath, configPath]
    process.exitCode = undefined
    console.log = (...values) => stdout.push(values.join(" "))
    console.error = (...values) => stderr.push(values.join(" "))
    const moduleUrl = `${pathToFileURL(modulePath).href}?case=${Date.now()}-${Math.random()}`
    await import(moduleUrl)
    return { status: process.exitCode ?? 0, stdout: stdout.join("\n"), stderr: stderr.join("\n") }
  } finally {
    process.argv = previousArgv
    process.exitCode = previousExitCode
    console.log = previousLog
    console.error = previousError
  }
}

test("runtime sensor validator works in an isolated tree without node_modules", async () => {
  const isolatedRoot = await mkdtemp(join(tmpdir(), "l0-spider-runtime-validator-"))
  try {
    await Promise.all([
      mkdir(join(isolatedRoot, "scripts")),
      mkdir(join(isolatedRoot, "server")),
      mkdir(join(isolatedRoot, "config")),
    ])
    await Promise.all([
      copyFile(
        join(projectRoot, "scripts/validate_sensor_exclusions_runtime.mjs"),
        join(isolatedRoot, "scripts/validate_sensor_exclusions_runtime.mjs"),
      ),
      copyFile(
        join(projectRoot, "server/sensorExclusionConfig.mjs"),
        join(isolatedRoot, "server/sensorExclusionConfig.mjs"),
      ),
      copyFile(
        join(projectRoot, "config/sensor-exclusions.json"),
        join(isolatedRoot, "config/sensor-exclusions.json"),
      ),
    ])

    const result = await runRuntimeValidator(
      join(isolatedRoot, "scripts/validate_sensor_exclusions_runtime.mjs"),
      join(isolatedRoot, "config/sensor-exclusions.json"),
    )

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: true,
      termCounts: {
        selfEquipment: 0,
        matchingAnomaly: 0,
        commonAnomaly: 0,
        commonCommonalityAnomaly: 0,
        mailing: 0,
      },
    })
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true })
  }
})

test("runtime validator rejects invalid or missing config used by the container entrypoint", async () => {
  const caseRoot = await mkdtemp(join(tmpdir(), "l0-spider-entrypoint-negative-"))
  try {
    for (const [caseName, configText] of [
      ["invalid", "{not-json"],
      ["missing", null],
    ]) {
      const configPath = join(caseRoot, `${caseName}.json`)
      if (configText !== null) await writeFile(configPath, configText, "utf8")

      const result = await runRuntimeValidator(
        join(projectRoot, "scripts/validate_sensor_exclusions_runtime.mjs"),
        configPath,
      )

      assert.notEqual(result.status, 0, `${caseName} 설정은 실패해야 합니다.`)
      assert.equal(result.stdout, "")
      assert.match(result.stderr, /sensor 제외 설정 검증에 실패했습니다/)
    }
  } finally {
    await rm(caseRoot, { recursive: true, force: true })
  }
})

test("Docker image installs bounded Node and Python dependencies before runtime", async () => {
  const [dockerfile, serverSource, runtimeValidator, containerEntrypoint] = await Promise.all([
    readProjectFile("Dockerfile"),
    readProjectFile("server.mjs"),
    readProjectFile("scripts/validate_sensor_exclusions_runtime.mjs"),
    readProjectFile("scripts/docker-entrypoint.sh"),
  ])

  assert.match(dockerfile, /FROM \$\{NODE_IMAGE\} AS application-build/)
  assert.match(dockerfile, /RUN npm ci\b/)
  assert.match(
    dockerfile,
    /RUN node scripts\/validate_sensor_exclusions_runtime\.mjs config\/sensor-exclusions\.json[\s\S]*npm run build[\s\S]*npm prune --omit=dev[\s\S]*node scripts\/validate_sensor_exclusions_runtime\.mjs config\/sensor-exclusions\.json/,
  )
  assert.match(dockerfile, /scripts\/requirements\.txt/)
  assert.match(dockerfile, /pip install[\s\S]*-r \/tmp\/l0-spider-requirements\.txt/)

  const runtimeStage = dockerfile.split("FROM ${NODE_IMAGE} AS runtime")[1]
  assert.ok(runtimeStage, "runtime stage가 필요합니다.")
  for (const requiredRuntimePath of [
    "node_modules",
    "dist",
    "server.mjs",
    "server",
    "scripts",
    "src",
    "config",
  ]) {
    assert.match(runtimeStage, new RegExp(`/opt/l0-spider/${requiredRuntimePath.replace(".", "\\.")}`))
  }
  assert.match(runtimeStage, /COPY --from=python-dependencies \/opt\/l0-spider-venv/)
  assert.match(runtimeStage, /apt-get install -y --no-install-recommends python3 tini tzdata/)
  assert.match(runtimeStage, /USER node/)
  assert.match(runtimeStage, /LIVE_RELOAD=0/)
  assert.match(runtimeStage, /BUILD_ON_START=0/)
  assert.match(runtimeStage, /HEALTHCHECK[\s\S]*http:\/\/127\.0\.0\.1:5173\//)
  assert.match(
    runtimeStage,
    /ENTRYPOINT \["tini", "--", "\/opt\/l0-spider\/scripts\/docker-entrypoint\.sh"\]/,
  )
  assert.match(runtimeStage, /CMD \["node", "server\.mjs"\]/)
  assert.doesNotMatch(runtimeStage, /RUN npm ci\b/)

  assert.doesNotMatch(serverSource, /^import .* from "vite"$/m)
  assert.match(
    serverSource,
    /if \(liveReload\) \{\n\s+const \{ createServer: createViteServer \} = await import\("vite"\)[\s\S]*?\n\} else \{/,
  )
  assert.match(runtimeValidator, /normalizeSensorExclusionConfig\(payload\)/)
  const sensorConfigSource = await readProjectFile("server/sensorExclusionConfig.mjs")
  assert.match(sensorConfigSource, /configCache\.ino === fileStat\.ino/)
  assert.match(sensorConfigSource, /failureSignature = `\$\{normalizedPath\}\\u0000\$\{fileStat\.ino\}/)
  assert.match(
    containerEntrypoint,
    /set -eu[\s\S]*node scripts\/validate_sensor_exclusions_runtime\.mjs[\s\S]*exec "\$@"/,
  )
})

test("Compose keeps runtime data read-only and host exposure explicit", async () => {
  const compose = await readProjectFile("compose.yaml")

  assert.match(compose, /^services:\n {2}l0-spider:/)
  assert.match(compose, /PORT: "5173"\n\s+LIVE_RELOAD: "0"\n\s+BUILD_ON_START: "0"\n\s+TZ: \$\{L0_SPIDER_TIMEZONE:\?/)
  assert.match(compose, /"\$\{L0_SPIDER_BIND_IP:-127\.0\.0\.1\}:\$\{L0_SPIDER_HOST_PORT:-5173\}:5173"/)
  assert.match(
    compose,
    /source: \$\{L0_SPIDER_APPDATA_PATH:-\/appdata\}\n\s+target: \/appdata\n\s+read_only: true\n\s+bind:\n\s+create_host_path: false/,
  )
  assert.match(
    compose,
    /source: \$\{L0_SPIDER_SENSOR_CONFIG_DIR:-\.\/config\}\n\s+target: \/opt\/l0-spider\/config\n\s+read_only: true\n\s+bind:\n\s+create_host_path: false/,
  )
  assert.match(compose, /\n {4}read_only: true\n/)
  assert.match(compose, /tmpfs:\n\s+- \/tmp:size=64m,mode=1777/)
  assert.match(compose, /cap_drop:\n\s+- ALL/)
  assert.match(compose, /security_opt:\n\s+- no-new-privileges:true/)
  assert.match(compose, /restart: unless-stopped/)
  assert.match(compose, /DB_INFO_PATH: \$\{L0_SPIDER_DB_INFO_CONTAINER_PATH:-\/appdata\/l0_spider\/db_info\.pkl\}/)
  assert.doesNotMatch(compose, /DB_PASSWORD|password:/i)
})

test("Docker build context, docs, and env example preserve the target-server contract", async () => {
  const [dockerignore, dockerfile, envExample, deploymentGuide, systemDeployment] = await Promise.all([
    readProjectFile(".dockerignore"),
    readProjectFile("Dockerfile"),
    readProjectFile(".env.docker.example"),
    readProjectFile("docs/operations/docker-deployment.md"),
    readProjectFile("docs/system/deployment.md"),
  ])

  for (const requiredPattern of [
    "node_modules",
    ".env",
    ".env.*",
    "*.pkl",
    "*.pem",
    "*.key",
    "*.crt",
    "*.cer",
    "*.tar",
  ]) {
    const escapedPattern = requiredPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(dockerignore, new RegExp(`^${escapedPattern}$`, "m"))
  }
  assert.match(dockerignore, /^!\.env\.docker\.example$/m)
  assert.doesNotMatch(dockerfile, /^COPY \.(?:\s|$)/m)
  assert.match(dockerfile, /COPY docs\/user-manual\/USER_MANUAL\.md \.\/docs\/user-manual\/USER_MANUAL\.md/)
  assert.match(dockerfile, /COPY docs\/user-manual\/images \.\/docs\/user-manual\/images/)
  for (const requiredManualContextRule of [
    "docs/*",
    "!docs/user-manual/",
    "docs/user-manual/*",
    "!docs/user-manual/USER_MANUAL.md",
    "!docs/user-manual/images/",
    "docs/user-manual/images/*",
    "!docs/user-manual/images/*.png",
  ]) {
    const escapedRule = requiredManualContextRule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(dockerignore, new RegExp(`^${escapedRule}$`, "m"))
  }
  assert.doesNotMatch(envExample, /DB_PASSWORD|PASSWORD=|TOKEN=|SECRET=|PRIVATE_KEY=/i)
  assert.match(envExample, /^L0_SPIDER_TIMEZONE=Asia\/Seoul$/m)
  assert.match(envExample, /^L0_SPIDER_SENSOR_CONFIG_DIR=\.\/config$/m)
  assert.match(deploymentGuide, /config --images/)
  assert.match(deploymentGuide, /compose --env-file \.env\.docker port l0-spider 5173/)
  assert.doesNotMatch(deploymentGuide, /npm run sensor-exclusions:validate/)
  assert.match(deploymentGuide, /entrypoint가 mount된 host\s+sensor JSON을 매번 검증/)

  const targetServerSection = systemDeployment
    .split("대상 Docker 서버에는")[1]
    ?.split("\n## 7.")[0]
  assert.ok(targetServerSection, "대상 Docker 서버 절차가 필요합니다.")
  assert.doesNotMatch(targetServerSection, /npm run/)
  assert.match(targetServerSection, /docker compose --env-file \.env\.docker up -d --no-build/)
})
