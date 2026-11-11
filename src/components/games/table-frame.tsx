import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { Btn } from "@/components/bits";

export function TableFrame({
  title,
  eyebrow,
  stack,
  cage,
  onLeave,
  onRules,
  children,
}: {
  title: string;
  eyebrow: string;
  stack: number;
  cage: number;
  onLeave: () => void;
  onRules: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-3 py-3 sm:px-6 sm:py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Btn onClick={onLeave}>Cash out</Btn>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-gold">{eyebrow}</p>
          <h1 className="font-display text-3xl text-cream">{title}</h1>
          <p className="text-xs text-muted">Session on tape</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-right text-sm leading-tight tabular-nums">
            <span className="block text-cream">Table {stack}</span>
            <span className="block text-muted">Cage {cage}</span>
          </p>
          <Btn tone="quiet" onClick={onRules} aria-label="Rules">
            <BookOpen className="size-4" aria-hidden />
          </Btn>
        </div>
      </header>
      <div className="mt-4 flex flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}
