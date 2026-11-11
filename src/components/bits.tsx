import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Btn({
  tone = "ghost",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "ghost" | "danger" | "quiet" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-40",
        tone === "gold" && "bg-gold text-ink hover:bg-gold-deep",
        tone === "ghost" && "border border-line bg-transparent text-cream hover:bg-rail",
        tone === "danger" && "bg-suit text-cream",
        tone === "quiet" && "bg-rail text-cream hover:bg-felt-light",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function RulesSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-felt p-5 text-cream shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-3xl text-cream">{title}</h2>
          <Btn tone="quiet" onClick={onClose}>
            Close
          </Btn>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-cream">{children}</div>
      </div>
    </div>
  );
}
