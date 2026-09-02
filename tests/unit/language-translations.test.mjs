import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
} from "../../src/i18n/translations.mjs"

test("기본 언어는 중국어이고 한국어·영어·중국어 선택지를 제공한다", () => {
  assert.equal(DEFAULT_LANGUAGE, "zh-CN")
  assert.deepEqual(SUPPORTED_LANGUAGES, ["ko", "en", "zh-CN"])
  assert.deepEqual(
    LANGUAGE_OPTIONS.map(({ value, label, htmlLang }) => ({ value, label, htmlLang })),
    [
      { value: "ko", label: "한국어", htmlLang: "ko" },
      { value: "en", label: "English", htmlLang: "en" },
      { value: "zh-CN", label: "中文", htmlLang: "zh-CN" },
    ],
  )
})

test("한국어와 중국어 리소스는 같은 영어 원문 키를 빠짐없이 제공한다", () => {
  const koreanKeys = Object.keys(TRANSLATIONS.ko).sort()
  const chineseKeys = Object.keys(TRANSLATIONS["zh-CN"]).sort()

  assert.deepEqual(chineseKeys, koreanKeys)
  assert.ok(koreanKeys.length >= 250)
  assert.equal(TRANSLATIONS.ko["Equipment Anomaly Detection"], "자설비 이상감지")
  assert.equal(TRANSLATIONS["zh-CN"]["Equipment Anomaly Detection"], "设备异常检测")
})
