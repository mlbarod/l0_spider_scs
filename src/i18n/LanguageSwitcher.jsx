import { LANGUAGE_OPTIONS } from "./translations.mjs"
import { useLanguage } from "./LanguageProvider"

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <div
      data-i18n-skip
      className="flex items-center rounded-full border border-white/20 bg-white/8 p-0.5 text-[11px] text-white/75"
      role="group"
      aria-label="Language selection"
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const isActive = option.value === language
        return (
          <button
            key={option.value}
            type="button"
            className={`rounded-full px-2.5 py-1 transition-colors ${isActive ? "bg-white text-black" : "hover:bg-white/10 hover:text-white"}`}
            aria-pressed={isActive}
            onClick={() => setLanguage(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
