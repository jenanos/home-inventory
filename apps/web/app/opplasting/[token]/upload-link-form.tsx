"use client"

import { useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Camera, CheckCircle2, ImagePlus, Loader2, XCircle } from "lucide-react"

type Result = { name: string; ok: boolean; message?: string }

export function UploadLinkForm({ token }: { token: string }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Result[]>([])

  async function upload(files: File[]) {
    if (files.length === 0) return
    setBusy(true)
    for (const file of files) {
      const form = new FormData()
      form.append("file", file)
      let result: Result
      try {
        const response = await fetch(`/api/upload-links/${token}`, {
          method: "POST",
          body: form,
        })
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        result = response.ok
          ? { name: file.name, ok: true }
          : {
              name: file.name,
              ok: false,
              message: body?.error?.message ?? "Opplastingen feilet.",
            }
      } catch {
        result = { name: file.name, ok: false, message: "Sjekk nettet." }
      }
      setResults((current) => [...current, result])
    }
    setBusy(false)
  }

  const inputProps = (camera: boolean) => ({
    type: "file" as const,
    className: "hidden",
    accept: camera ? "image/*" : "image/*,application/pdf",
    multiple: !camera,
    ...(camera ? { capture: "environment" as const } : {}),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      void upload([...(event.target.files ?? [])])
      event.target.value = ""
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera className="h-4 w-4" data-icon="inline-start" />
          Ta bilde
        </Button>
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? (
            <Loader2
              className="h-4 w-4 animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <ImagePlus className="h-4 w-4" data-icon="inline-start" />
          )}
          Velg filer
        </Button>
      </div>
      <input ref={cameraInput} {...inputProps(true)} />
      <input ref={fileInput} {...inputProps(false)} />

      {results.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {results.map((result, index) => (
            <li key={index} className="flex items-start gap-2">
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              )}
              <span className="min-w-0 break-words">
                {result.name}
                {result.message && (
                  <span className="block text-xs text-muted-foreground">
                    {result.message}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {results.some((result) => result.ok) && !busy && (
        <p className="text-sm text-muted-foreground">
          Ferdig? Gå tilbake til samtalen og si fra til assistenten.
        </p>
      )}
    </div>
  )
}
