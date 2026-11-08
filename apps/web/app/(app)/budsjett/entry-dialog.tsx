"use client"

import { useState, useTransition } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { upsertBudgetEntry } from "@/lib/actions/budget"
import { entryMonthlyAmount } from "@/lib/application/budget/calculations"
import { toast } from "sonner"
import type { BudgetEntryType, BudgetFrequency } from "@workspace/db"
import type { BudgetCategoryData, BudgetEntryData } from "./budget-view"
import { BudgetFormSheet, FormActions } from "./budget-form-sheet"
import {
  FREQUENCY_LABELS,
  formatCurrency,
  optionalString,
  parseOptionalNumber,
} from "./budget-format"
import { MoreDetails } from "./more-details"

interface EntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: BudgetEntryData | null
  categories: BudgetCategoryData[]
  defaults: { categoryId?: string | null; type?: BudgetEntryType }
}

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  categories,
  defaults,
}: EntryDialogProps) {
  const title = entry ? "Rediger budsjettpost" : "Legg til budsjettpost"
  const initialCategoryId =
    entry?.category?.id ??
    (defaults.categoryId &&
    categories.some((category) => category.id === defaults.categoryId)
      ? defaults.categoryId
      : null)

  return (
    <BudgetFormSheet open={open} onOpenChange={onOpenChange} title={title}>
      {open ? (
        <EntryDialogForm
          key={entry?.id ?? "new"}
          entry={entry}
          categories={categories}
          initialCategoryId={initialCategoryId}
          initialType={entry?.type ?? defaults.type ?? "EXPENSE"}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BudgetFormSheet>
  )
}

function EntryDialogForm({
  entry,
  categories,
  initialCategoryId,
  initialType,
  onOpenChange,
}: {
  entry: BudgetEntryData | null
  categories: BudgetCategoryData[]
  initialCategoryId: string | null
  initialType: BudgetEntryType
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(entry?.name ?? "")
  const [categoryId, setCategoryId] = useState<string>(
    initialCategoryId ?? "none"
  )
  const [type, setType] = useState<BudgetEntryType>(initialType)
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "")
  const [frequency, setFrequency] = useState<BudgetFrequency>(
    entry?.frequency ?? "MONTHLY"
  )
  const [provider, setProvider] = useState(entry?.provider ?? "")
  const [paymentDay, setPaymentDay] = useState(
    entry?.paymentDay != null ? String(entry.paymentDay) : ""
  )
  const [renewalDate, setRenewalDate] = useState(entry?.renewalDate ?? "")
  const [notes, setNotes] = useState(entry?.notes ?? "")
  const [isPending, startTransition] = useTransition()

  const amountNumber = parseOptionalNumber(amount)
  // Fields that do not apply to the chosen type are hidden and not saved.
  const hasProvider = type === "EXPENSE" || type === "SAVINGS"
  const hasRenewal = type === "EXPENSE"
  const filledCount = [
    hasProvider ? provider : "",
    paymentDay,
    hasRenewal ? renewalDate : "",
    notes,
  ].filter((value) => value.trim() !== "").length

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const day = parseOptionalNumber(paymentDay)

    if (!name.trim() || amountNumber === null || amountNumber < 0) {
      toast.error("Fyll inn navn og beløp")
      return
    }
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
      toast.error("Trekkdag må være et tall fra 1 til 31")
      return
    }

    startTransition(async () => {
      try {
        await upsertBudgetEntry({
          id: entry?.id,
          name: name.trim(),
          categoryId: categoryId === "none" ? null : categoryId,
          type,
          amount: amountNumber,
          frequency,
          provider: hasProvider ? optionalString(provider) : null,
          paymentDay: day,
          renewalDate: hasRenewal && renewalDate ? renewalDate : null,
          notes: optionalString(notes),
        })
        toast.success(entry ? "Post oppdatert" : "Post lagt til")
        onOpenChange(false)
      } catch {
        toast.error("Noe gikk galt")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-name">Navn</Label>
        <Input
          id="entry-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Strøm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-type">Type</Label>
        <Select
          value={type}
          onValueChange={(value) => setType(value as BudgetEntryType)}
        >
          <SelectTrigger id="entry-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EXPENSE">Kostnad</SelectItem>
            <SelectItem value="SAVINGS">Sparing</SelectItem>
            <SelectItem value="INCOME">Inntekt</SelectItem>
            <SelectItem value="DEDUCTION">Fradrag (negativ kostnad)</SelectItem>
          </SelectContent>
        </Select>
        {type === "SAVINGS" && (
          <p className="text-xs text-muted-foreground">
            Fond, BSU, buffer og lignende. Trekkes fra disponibelt, men vises
            som sparing og ikke som kostnad.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="entry-category">Kategori (valgfri)</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="entry-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ingen (ukategorisert)</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry-amount">Beløp (kr)</Label>
          <Input
            id="entry-amount"
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="F.eks. 2000"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry-frequency">Hvor ofte</Label>
          <Select
            value={frequency}
            onValueChange={(value) => setFrequency(value as BudgetFrequency)}
          >
            <SelectTrigger id="entry-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {frequency !== "MONTHLY" && amountNumber !== null && (
        <p className="rounded-md bg-muted p-3 text-sm">
          Tilsvarer{" "}
          <span className="font-semibold">
            {formatCurrency(
              entryMonthlyAmount({ amount: amountNumber, frequency })
            )}
          </span>{" "}
          per måned
        </p>
      )}

      <MoreDetails filledCount={filledCount}>
        {hasProvider && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-provider">Leverandør</Label>
            <Input
              id="entry-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="F.eks. Tibber eller Gjensidige"
            />
          </div>
        )}
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="entry-payment-day">Trekkdag</Label>
            <Input
              id="entry-payment-day"
              type="number"
              step="1"
              min="1"
              max="31"
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              placeholder="1–31"
            />
          </div>
          {hasRenewal && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="entry-renewal">Bindingstid til</Label>
              <Input
                id="entry-renewal"
                type="date"
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="entry-notes">Notat</Label>
          <Textarea
            id="entry-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="F.eks. avtalevilkår eller hvor tallet kommer fra"
            rows={3}
          />
        </div>
      </MoreDetails>

      <FormActions
        onCancel={() => onOpenChange(false)}
        isPending={isPending}
        submitLabel={entry ? "Lagre" : "Legg til"}
      />
    </form>
  )
}
