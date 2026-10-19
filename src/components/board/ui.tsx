import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:cursor-default disabled:opacity-40",
  {
    variants: {
      tone: {
        honey: "rounded-md bg-honey text-honey-fg uppercase italic tracking-wide font-display",
        quiet: "rounded-md bg-raised text-ink shadow-border uppercase italic tracking-wide font-display",
        ghost: "bg-transparent text-muted",
      },
    },
    defaultVariants: { tone: "honey" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>;

export function Button({ tone, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonStyles({ tone }), className)} {...props} />;
}

export const fieldClass =
  "min-h-11 w-full rounded-xl bg-raised px-3 text-base text-ink shadow-border outline-none placeholder:text-muted";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg bg-surface p-5 shadow-border", className)}>
      {children}
    </section>
  );
}
