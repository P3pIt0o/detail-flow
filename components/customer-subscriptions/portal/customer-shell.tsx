import type React from "react"

export function CustomerShell({ title, companyName, children }: { title: string; companyName?: string | null; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        {companyName ? <p className="text-sm text-muted-foreground">{companyName}</p> : null}
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  )
}
