import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#DBEAFE] text-[#1E40AF] hover:bg-[#BFDBFE]",
        secondary:
          "border-transparent bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]",
        destructive:
          "border-transparent bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]",
        outline: "text-foreground border-[#E5E7EB]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }