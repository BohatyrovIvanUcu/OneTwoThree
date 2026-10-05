import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-indigo-500/90 via-indigo-600/90 to-purple-600/90 text-white shadow-[0_4px_16px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] border border-white/20 backdrop-blur-md hover:from-indigo-500 hover:to-purple-500 hover:shadow-[0_6px_24px_rgba(99,102,241,0.5)] hover:scale-[1.01] active:scale-[0.98]",
        destructive:
          "bg-rose-500/80 text-white hover:bg-rose-500/95 border border-rose-400/30 backdrop-blur-md shadow-[0_4px_16px_rgba(244,63,94,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] hover:scale-[1.01] active:scale-[0.98]",
        outline:
          "border border-white/20 bg-white/[0.07] backdrop-blur-md text-foreground shadow-xs hover:bg-white/[0.14] hover:border-white/30 hover:text-white active:scale-[0.98]",
        secondary:
          "bg-white/[0.1] text-white border border-white/15 backdrop-blur-md hover:bg-white/[0.18] hover:border-white/25 active:scale-[0.98]",
        ghost:
          "text-slate-200 hover:bg-white/[0.1] hover:text-white backdrop-blur-sm active:scale-[0.98]",
        link: "text-indigo-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-xl px-6 has-[>svg]:px-4 text-base",
        icon: "size-9 rounded-xl",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
