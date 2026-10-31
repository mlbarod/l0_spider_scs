import { useId, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { translateText, useLanguage } from "@/i18n"
import { cn } from "@/lib/utils"
import { normalizeFilterSearch } from "../utils/filterSearch.mjs"

const modes = [{ value: "include", label: "Include" }, { value: "exclude", label: "Exclude" }]

export function FilterSearchInput({ title, query, onQueryChange, disabled, className }) {
  const { language } = useLanguage()
  const t = (value) => translateText(value, language)
  const { text, mode } = normalizeFilterSearch(query)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const optionsId = useId()
  const showOptions = open && !disabled

  return (
    <div
      className="relative"
      data-i18n-skip
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          inputRef.current?.focus()
          setOpen(false)
        }
      }}
    >
      <Input
        ref={inputRef}
        value={text}
        onChange={(event) => {
          onQueryChange({ text: event.target.value, mode })
          setOpen(false)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        aria-label={`${t(title)}: ${t("Filter search")}`}
        placeholder={t("Search…")}
        className={cn("h-8 rounded-full border-[#e0e0e0] bg-white pl-24 pr-3 text-xs", className)}
        disabled={disabled}
      />
      <button
        type="button"
        className="absolute inset-y-0 left-1 my-1 flex items-center gap-0.5 rounded-full px-2 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        aria-label={`${t(title)}: ${t("Filter search mode")}: ${t(mode === "exclude" ? "Exclude" : "Include")}`}
        aria-expanded={showOptions}
        aria-controls={showOptions ? optionsId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {t(mode === "exclude" ? "Exclude" : "Include")}
        <ChevronDown className="size-3" aria-hidden="true" />
      </button>
      {showOptions ? (
        <div
          id={optionsId}
          role="group"
          aria-label={`${t(title)}: ${t("Filter search mode")}`}
          className="absolute left-0 right-0 top-full z-20 mt-1 flex gap-1 rounded-lg border border-[#e0e0e0] bg-white p-1 shadow-md"
        >
          {modes.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === option.value && "bg-primary/10 text-primary",
              )}
              onClick={() => {
                onQueryChange({ text, mode: option.value })
                inputRef.current?.focus()
                setOpen(false)
              }}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
