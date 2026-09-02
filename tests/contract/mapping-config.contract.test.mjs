import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import Ajv2020 from "ajv/dist/2020.js"

import {
  areDbConnectionsEnabled,
  isSelfEquipmentDbEnabled,
  validateLineMappingPayload,
} from "../../src/features/fdc-trend/api/mappingContract.mjs"
import { SPIDER_DATA_PATH_TEMPLATES } from "../../src/config/spiderDataPaths.mjs"
import { buildMappingConfigResponse } from "../../server/mappingConfig.mjs"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(testDirectory, "../../harness/contracts/mapping-config.schema.json")
const schema = JSON.parse(readFileSync(schemaPath, "utf8"))
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)

const validMapping = {
  line_mapping: { TEAM_A: "LINE_A" },
  sdwt_mapping: { TEAM_A: "SDWT_A" },
}

test("SCS mapping 기본 경로는 SCS 전용 appdata를 사용한다", () => {
  assert.equal(
    SPIDER_DATA_PATH_TEMPLATES.mappingConfig,
    "/appdata/l0_spider_scs/mapping_config.json",
  )
})

test("synthetic mapping success payload가 Schema와 runtime 계약을 만족한다", () => {
  assert.equal(validate(validMapping), true, JSON.stringify(validate.errors))
  assert.deepEqual(validateLineMappingPayload(validMapping), validMapping)
})

test("mapping capability는 Schema를 만족하고 DB 기능을 fail-close한다", () => {
  const fileOnlyMapping = buildMappingConfigResponse(validMapping, {})
  const fullMapping = buildMappingConfigResponse(validMapping, {
    SCS_DATA_CONNECTIONS_ENABLED: "1",
  })

  assert.equal(validate(fileOnlyMapping), true, JSON.stringify(validate.errors))
  assert.equal(validate(fullMapping), true, JSON.stringify(validate.errors))
  assert.equal(areDbConnectionsEnabled(fileOnlyMapping), false)
  assert.equal(areDbConnectionsEnabled(fullMapping), false)
  assert.equal(isSelfEquipmentDbEnabled(fileOnlyMapping), false)
  assert.equal(isSelfEquipmentDbEnabled(fullMapping), false)
  assert.equal(isSelfEquipmentDbEnabled(validMapping), false)
})

test("빈 line mapping과 잘못된 value type을 거부한다", () => {
  assert.equal(validate({ line_mapping: {}, sdwt_mapping: {} }), false)
  assert.equal(validate({
    line_mapping: { TEAM_A: 123 },
    sdwt_mapping: {},
  }), false)
  assert.throws(
    () => validateLineMappingPayload({ line_mapping: {}, sdwt_mapping: {} }),
    /line_mapping reference mapping is empty/,
  )
})
