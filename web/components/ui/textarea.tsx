import * as React from "react";
import { cn } from "@/lib/cn";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[80px] w-full rounded-lg border border-brand-ink-200 bg-white px-3 py-2 text-sm text-brand-ink",
        "placeholder:text-brand-ink-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
