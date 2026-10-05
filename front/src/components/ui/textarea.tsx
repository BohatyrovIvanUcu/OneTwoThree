import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-base text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all outline-none placeholder:text-slate-400/80 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/80 aria-invalid:ring-destructive/20 md:text-sm",
        "focus-visible:border-indigo-400/80 focus-visible:bg-white/[0.09] focus-visible:ring-4 focus-visible:ring-indigo-500/25",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
