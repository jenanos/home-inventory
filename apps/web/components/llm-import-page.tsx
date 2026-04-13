"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BotMessageSquare,
  Check,
  ClipboardPaste,
  Copy,
  Loader2,
} from "lucide-react"
import type { ReactNode } from "react"

const STEPS = [
  { key: "prompt", label: "Prompt" },
  { key: "paste", label: "JSON" },
  { key: "preview", label: "Forhåndsvisning" },
] as const

type LlmImportStep = (typeof STEPS)[number]["key"]

interface LlmImportPromptSection {
  id: string
  title: string
  description?: string
  prompt: string
  copied: boolean
  onCopy: () => void
  copyLabel?: string
}

export function LlmImportPageHeader({
  backHref,
  title,
  description,
  step,
  backLabel = "Tilbake",
}: {
  backHref: string
  title: string
  description: string
  step: LlmImportStep
  backLabel?: string
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="w-fit">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            {backLabel}
          </Link>
        </Button>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BotMessageSquare className="h-4 w-4" />
            <span className="text-sm">LLM-import</span>
          </div>
          <div>
            <h1 className="font-heading text-2xl font-medium sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-base">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((entry, index) => {
          const isActive = entry.key === step
          const isDone =
            (step === "paste" && entry.key === "prompt") ||
            (step === "preview" &&
              (entry.key === "prompt" || entry.key === "paste"))

          return (
            <div
              key={entry.key}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                isActive && "border-primary bg-primary/10 text-foreground",
                isDone &&
                  "border-emerald-500/40 bg-emerald-500/10 text-foreground",
                !isActive && !isDone && "text-muted-foreground"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs ring-1 ring-foreground/10">
                {isDone ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span>{entry.label}</span>
            </div>
          )
        })}
      </div>
    </header>
  )
}

export function LlmImportPromptStep({
  title,
  description,
  prompt,
  copied,
  onCopy,
  onNext,
  sidebar,
}: {
  title: string
  description: string
  prompt: string
  copied: boolean
  onCopy: () => void
  onNext: () => void
  sidebar?: ReactNode
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <section className="space-y-4">
        <div className="space-y-2 border-b pb-3">
          <h2 className="font-heading text-xl font-medium">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        <LlmImportPromptCard
          title="Prompt"
          prompt={prompt}
          copied={copied}
          onCopy={onCopy}
        />

        <Button variant="outline" onClick={onNext}>
          Neste
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </section>

      {sidebar ? (
        <aside className="space-y-3 xl:pt-[3.25rem]">{sidebar}</aside>
      ) : null}
    </div>
  )
}

export function LlmImportMultiPromptStep({
  title,
  description,
  sections,
  onNext,
  nextLabel = "Neste",
  sidebar,
}: {
  title: string
  description: string
  sections: LlmImportPromptSection[]
  onNext: () => void
  nextLabel?: string
  sidebar?: ReactNode
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <section className="space-y-4">
        <div className="space-y-2 border-b pb-3">
          <h2 className="font-heading text-xl font-medium">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        <div className="space-y-4">
          {sections.map((section) => (
            <LlmImportPromptCard
              key={section.id}
              title={section.title}
              description={section.description}
              prompt={section.prompt}
              copied={section.copied}
              onCopy={section.onCopy}
              copyLabel={section.copyLabel}
            />
          ))}
        </div>

        <Button variant="outline" onClick={onNext}>
          {nextLabel}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </section>

      {sidebar ? (
        <aside className="space-y-3 xl:pt-[3.25rem]">{sidebar}</aside>
      ) : null}
    </div>
  )
}

export function LlmImportModeToggle<TValue extends string>({
  value,
  onValueChange,
  options,
}: {
  value: TValue
  onValueChange: (value: TValue) => void
  options: Array<{
    value: TValue
    label: string
    description: string
  }>
}) {
  const activeOption = options.find((option) => option.value === value)

  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-medium">Velg importspor</h2>
        <p className="text-sm text-muted-foreground">
          Bytt mellom vanlig LLM-import og sparring med full erstatning.
        </p>
      </div>

      <Tabs
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      >
        <TabsList className="w-full sm:w-fit">
          {options.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="flex-1 px-3 sm:flex-none"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeOption ? (
        <p className="text-sm text-muted-foreground">
          {activeOption.description}
        </p>
      ) : null}
    </section>
  )
}

export function LlmImportPasteStep({
  title,
  label,
  inputId,
  value,
  onChange,
  placeholder,
  parseError,
  showError,
  onBack,
  onParse,
  isParsing,
  rows = 18,
}: {
  title: string
  label: string
  inputId: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  parseError: string | null
  showError: boolean
  onBack: () => void
  onParse: () => void
  isParsing: boolean
  rows?: number
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-2 border-b pb-3">
        <h2 className="font-heading text-xl font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Lim inn JSON-svaret du fikk fra LLM-en.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        <Textarea
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="min-h-[28rem] resize-y font-mono text-xs"
        />
      </div>

      {parseError && showError ? (
        <LlmImportErrorAlert>{parseError}</LlmImportErrorAlert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
          Tilbake
        </Button>
        <Button onClick={onParse} disabled={!value.trim() || isParsing}>
          {isParsing ? (
            <>
              <Loader2
                className="h-4 w-4 animate-spin"
                data-icon="inline-start"
              />
              Sjekker duplikater...
            </>
          ) : (
            <>
              <ClipboardPaste className="h-4 w-4" data-icon="inline-start" />
              Tolk JSON
            </>
          )}
        </Button>
      </div>
    </section>
  )
}

export function LlmImportPreviewHeader({
  summary,
  parseError,
  description,
}: {
  summary: ReactNode
  parseError?: string | null
  description: string
}) {
  return (
    <section className="space-y-2 border-b pb-4">
      <h2 className="font-heading text-xl font-medium">Forhåndsvisning</h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {summary}
          {parseError ? (
            <Badge variant="secondary" className="text-xs">
              {parseError}
            </Badge>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
    </section>
  )
}

export function LlmImportStickyActions({
  importError,
  onBack,
  cancelHref,
  onPrimary,
  isPending,
  primaryLabel,
  pendingLabel = "Importerer...",
  primaryDisabled,
}: {
  importError?: string | null
  onBack: () => void
  cancelHref: string
  onPrimary: () => void
  isPending: boolean
  primaryLabel: string
  pendingLabel?: string
  primaryDisabled: boolean
}) {
  return (
    <>
      {importError ? (
        <LlmImportErrorAlert>{importError}</LlmImportErrorAlert>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" data-icon="inline-start" />
            Tilbake
          </Button>
          <Button variant="ghost" asChild>
            <Link href={cancelHref}>Avbryt</Link>
          </Button>
          <div className="flex-1" />
          <Button onClick={onPrimary} disabled={primaryDisabled}>
            {isPending ? (
              <>
                <Loader2
                  className="h-4 w-4 animate-spin"
                  data-icon="inline-start"
                />
                {pendingLabel}
              </>
            ) : (
              primaryLabel
            )}
          </Button>
        </div>
      </div>
    </>
  )
}

export function LlmImportErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p className="text-sm whitespace-pre-line text-destructive">{children}</p>
    </div>
  )
}

function LlmImportPromptCard({
  title,
  description,
  prompt,
  copied,
  onCopy,
  copyLabel = "Kopier prompt",
}: {
  title: string
  description?: string
  prompt: string
  copied: boolean
  onCopy: () => void
  copyLabel?: string
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border bg-muted/30">
        <ScrollArea className="h-[24rem] px-3 py-3 sm:px-4 sm:py-4">
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap sm:text-[13px]">
            {prompt}
          </pre>
        </ScrollArea>
      </div>

      <Button onClick={onCopy}>
        {copied ? (
          <>
            <Check className="h-4 w-4" data-icon="inline-start" />
            Kopiert
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" data-icon="inline-start" />
            {copyLabel}
          </>
        )}
      </Button>
    </div>
  )
}
