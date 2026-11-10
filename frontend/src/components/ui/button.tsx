import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Cyan = the primary interaction. Green is reserved for verified/completed (design.md §16.3).
        primary: "bg-accent text-text-inverse hover:bg-accent-hover",
        secondary: "border border-border bg-surface-elevated text-text hover:border-text-muted",
        outline: "border border-border text-text hover:border-text-secondary hover:bg-surface",
        ghost: "text-text-secondary hover:bg-surface hover:text-text",
        danger: "border border-red/40 bg-red/10 text-red hover:bg-red/20",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10 max-md:size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
