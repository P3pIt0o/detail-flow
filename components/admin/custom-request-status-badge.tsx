import { statusMeta } from "@/lib/custom-requests"
import { cn } from "@/lib/utils"

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  danger: "bg-destructive/10 text-destructive",
}

/** Pastille de statut d'une demande personnalisée. */
export function CustomRequestStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status)
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit items-center rounded-full px-2.5 text-xs font-medium",
        TONE_CLASS[meta.tone] ?? TONE_CLASS.neutral,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
