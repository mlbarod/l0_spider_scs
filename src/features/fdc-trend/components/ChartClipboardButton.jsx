import { useState } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n"

const CLIPBOARD_TEXT = {
  ko: {
    label: "클립보드", aria: "차트 이미지를 클립보드에 저장", unsupported: "이 브라우저에서는 클립보드 이미지 저장을 지원하지 않습니다.",
    success: "차트 이미지를 클립보드에 저장했습니다.", failure: "클립보드 저장에 실패했습니다.",
  },
  en: {
    label: "Clipboard", aria: "Copy chart image to clipboard", unsupported: "This browser does not support copying images to the clipboard.",
    success: "Copied the chart image to the clipboard.", failure: "Unable to copy to the clipboard.",
  },
  "zh-CN": {
    label: "剪贴板", aria: "将图表图片保存到剪贴板", unsupported: "此浏览器不支持将图片保存到剪贴板。",
    success: "已将图表图片保存到剪贴板。", failure: "保存到剪贴板失败。",
  },
}

// Same form as l0_spider's chart clipboard button; prepareImage resolves to a PNG data URL.
export function ChartClipboardButton({ prepareImage, disabled = false }) {
  const { language } = useLanguage()
  const t = CLIPBOARD_TEXT[language] ?? CLIPBOARD_TEXT.ko
  const [copying, setCopying] = useState(false)

  async function copyImage() {
    if (copying || disabled) return
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      toast.error(t.unsupported)
      return
    }
    setCopying(true)
    try {
      // Pass a Promise so the clipboard write stays tied to the click while the image is prepared.
      const blob = prepareImage().then((dataUrl) => fetch(dataUrl)).then((response) => response.blob())
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      toast.success(t.success)
    } catch {
      toast.error(t.failure)
    } finally {
      setCopying(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="h-9 px-[0.9rem] text-sm" data-i18n-skip
      disabled={disabled || copying} onClick={copyImage} aria-label={t.aria} title={t.aria}>
      {copying ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
      {t.label}
    </Button>
  )
}
