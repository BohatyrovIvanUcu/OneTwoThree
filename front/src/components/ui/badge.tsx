import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-white/20 bg-indigo-500/25 backdrop-blur-md text-white shadow-[0_2px_8px_rgba(99,102,241,0.2)] [a&]:hover:bg-indigo-500/40",
        secondary:
          "border-white/15 bg-white/10 backdrop-blur-md text-slate-200 shadow-xs [a&]:hover:bg-white/20",
        destructive:
          "border-rose-400/30 bg-rose-500/25 backdrop-blur-md text-rose-200 shadow-xs [a&]:hover:bg-rose-500/40",
        outline:
          "border-white/20 text-slate-300 backdrop-blur-sm [a&]:hover:bg-white/10 [a&]:hover:text-white",
        ghost: "[a&]:hover:bg-white/10 [a&]:hover:text-white",
        link: "text-indigo-400 underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
