import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-base text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all outline-none selection:bg-indigo-500/30 selection:text-white file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-indigo-400/80 focus-visible:bg-white/[0.09] focus-visible:ring-4 focus-visible:ring-indigo-500/25",
        "aria-invalid:border-destructive/80 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
