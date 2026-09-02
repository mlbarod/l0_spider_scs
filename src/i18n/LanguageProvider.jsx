import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react"

import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, SUPPORTED_LANGUAGES, TRANSLATIONS } from "./translations.mjs"

const STORAGE_KEY = "l0-spider-language"
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title"]
const originalTextByNode = new WeakMap()
const originalAttributesByElement = new WeakMap()

let activeLanguage = DEFAULT_LANGUAGE

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
})

function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value)
}

function getInitialLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE
  try {
    const storedLanguage = window.localStorage.getItem(STORAGE_KEY)
    return isSupportedLanguage(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

function formatDynamicText(value, language) {
  const formats = language === "ko"
    ? [
        [/^([\d,]+) lines selected$/, "$1개 라인 선택"],
        [/^([\d,]+) lines total$/, "총 $1개 라인"],
        [/^([\d,]+) rows$/, "$1개 행"],
        [/^([\d,]+) points$/, "$1개 포인트"],
        [/^([\d,]+) selected$/, "$1개 선택"],
        [/^([\d,]+) total$/, "총 $1건"],
        [/^([\d,]+) days$/, "$1일"],
        [/^Page ([\d,]+) of ([\d,]+)$/, "$2페이지 중 $1페이지"],
        [/^Page ([\d,]+)$/, "$1페이지"],
        [/^Line ([\d,]+) of ([\d,]+)$/, "$2개 라인 중 $1번째"],
        [/^([\d,]+) EQPs · ([\d,]+) points$/, "$1개 EQP · $2개 포인트"],
        [/^([\d,]+) EQP · ([\d,]+) points$/, "$1개 EQP · $2개 포인트"],
        [/^Showing top ([\d,]+) lines$/, "상위 $1개 라인 표시"],
        [/^Latest data (.+)$/, "최신 데이터 $1"],
        [/^Compared with (.+)$/, "$1 대비"],
        [/^Client IP: (.+)$/, "접속 IP: $1"],
        [/^Support code: (.+)$/, "문의 코드: $1"],
        [/^Failed to save click history: (.+)$/, "클릭 이력 저장 실패: $1"],
        [/^No (.+) matches the selected SDWT\.$/, "선택한 SDWT와 일치하는 $1이(가) 없습니다."],
        [/^No Sensor matches the selected (.+)\.$/, "선택한 $1과 일치하는 Sensor가 없습니다."],
        [/^Select (.+) first$/, "$1을(를) 먼저 선택하세요"],
      ]
    : [
        [/^([\d,]+) lines selected$/, "已选择 $1 条产线"],
        [/^([\d,]+) lines total$/, "共 $1 条产线"],
        [/^([\d,]+) rows$/, "$1 行"],
        [/^([\d,]+) points$/, "$1 个点"],
        [/^([\d,]+) selected$/, "已选择 $1 项"],
        [/^([\d,]+) total$/, "共 $1 项"],
        [/^([\d,]+) days$/, "$1 天"],
        [/^Page ([\d,]+) of ([\d,]+)$/, "第 $1 页，共 $2 页"],
        [/^Page ([\d,]+)$/, "第 $1 页"],
        [/^Line ([\d,]+) of ([\d,]+)$/, "第 $1 条产线，共 $2 条"],
        [/^([\d,]+) EQPs · ([\d,]+) points$/, "$1 个 EQP · $2 个点"],
        [/^([\d,]+) EQP · ([\d,]+) points$/, "$1 个 EQP · $2 个点"],
        [/^Showing top ([\d,]+) lines$/, "显示前 $1 条产线"],
        [/^Latest data (.+)$/, "最新数据 $1"],
        [/^Compared with (.+)$/, "与 $1 相比"],
        [/^Client IP: (.+)$/, "客户端 IP：$1"],
        [/^Support code: (.+)$/, "咨询代码：$1"],
        [/^Failed to save click history: (.+)$/, "保存点击记录失败：$1"],
        [/^No (.+) matches the selected SDWT\.$/, "没有与所选 SDWT 匹配的 $1。"],
        [/^No Sensor matches the selected (.+)\.$/, "没有与所选 $1 匹配的 Sensor。"],
        [/^Select (.+) first$/, "请先选择 $1"],
      ]

  for (const [pattern, replacement] of formats) {
    if (pattern.test(value)) return value.replace(pattern, replacement)
  }
  return value
}

export function translateText(value, language = activeLanguage) {
  if (typeof value !== "string" || language === "en") return value
  const supportCodeMatch = value.match(/^(.*?) \[Support code: ([^\]]+)\]$/)
  if (supportCodeMatch) {
    const translatedMessage = translateText(supportCodeMatch[1], language)
    const supportCodeLabel = language === "ko" ? "문의 코드" : "咨询代码"
    return `${translatedMessage} [${supportCodeLabel}: ${supportCodeMatch[2]}]`
  }
  const directTranslation = TRANSLATIONS[language]?.[value]
  return directTranslation ?? formatDynamicText(value, language)
}

function translatedVariants(value) {
  return SUPPORTED_LANGUAGES.map((language) => translateText(value, language))
}

function shouldSkipNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  return Boolean(element?.closest?.("[data-i18n-skip]"))
}

function translateTextNode(node, language) {
  if (shouldSkipNode(node)) return
  const currentValue = node.nodeValue ?? ""
  const trimmedValue = currentValue.trim()
  if (!trimmedValue) return

  let originalValue = originalTextByNode.get(node)
  if (!originalValue || !translatedVariants(originalValue).includes(trimmedValue)) {
    originalValue = trimmedValue
    originalTextByNode.set(node, originalValue)
  }

  const translatedValue = translateText(originalValue, language)
  if (translatedValue === trimmedValue) return
  const leadingWhitespace = currentValue.match(/^\s*/)?.[0] ?? ""
  const trailingWhitespace = currentValue.match(/\s*$/)?.[0] ?? ""
  node.nodeValue = `${leadingWhitespace}${translatedValue}${trailingWhitespace}`
}

function translateElementAttributes(element, language) {
  if (shouldSkipNode(element)) return
  const originals = originalAttributesByElement.get(element) ?? {}

  TRANSLATABLE_ATTRIBUTES.forEach((attributeName) => {
    const currentValue = element.getAttribute(attributeName)
    if (!currentValue) return
    const previousOriginal = originals[attributeName]
    if (!previousOriginal || !translatedVariants(previousOriginal).includes(currentValue)) {
      originals[attributeName] = currentValue
    }
    const translatedValue = translateText(originals[attributeName], language)
    if (translatedValue !== currentValue) element.setAttribute(attributeName, translatedValue)
  })

  originalAttributesByElement.set(element, originals)
}

function translateSubtree(root, language) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, language)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE || shouldSkipNode(root)) return

  translateElementAttributes(root, language)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language)
    else translateElementAttributes(node, language)
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage)
  activeLanguage = language

  const setLanguage = useCallback((nextLanguage) => {
    if (!isSupportedLanguage(nextLanguage)) return
    activeLanguage = nextLanguage
    setLanguageState(nextLanguage)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage)
    } catch {
      // The selected language remains active for the current session.
    }
  }, [])

  useLayoutEffect(() => {
    const htmlLanguage = LANGUAGE_OPTIONS.find((option) => option.value === language)?.htmlLang ?? language
    document.documentElement.lang = htmlLanguage
    translateSubtree(document.body, language)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") translateElementAttributes(mutation.target, language)
        mutation.addedNodes.forEach((node) => translateSubtree(node, language))
        if (mutation.type === "characterData") translateTextNode(mutation.target, language)
      })
    })
    observer.observe(document.body, {
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [language])

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
