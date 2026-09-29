import { cn } from "@/lib/utils"

const btnBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:opacity-50"

export const btnPrimary = cn(btnBase, "bg-primary text-primary-foreground hover:bg-primary/90")
export const btnOutline = cn(btnBase, "border border-border bg-card text-foreground hover:bg-muted")
