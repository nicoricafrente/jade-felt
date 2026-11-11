import { useEffect, useReducer, useRef } from "react";
import { CardRow, PlayingCard } from "@/components/playing-card";
import { Btn } from "@/components/bits";
import { TableFrame } from "@/components/games/table-frame";
import { actorOptions, createHoldem, reduceHoldem, streetLabel, type HoldemAction, type HoldemState } from "@/lib/cards/holdem";
import { recordHand } from "@/lib/ledger";
import { actingHoldem, describeHoldem, useSessionTape, viewHoldem } from "@/lib/session-tape";

export function HoldemTable({
  stack,
  cage,
  onLeave,
  onFund,
  onStack,
  onRules,
}: {
  stack: number;
  cage: number;
  onLeave: (stack: number) => void;
  onFund: (amount: number) => number;
  onStack: (stack: number) => void;
  onRules: () => void;
}) {
  const [state, rawDispatch] = useReducer(reduceHoldem, stack, createHoldem);
  const actionRef = useRef<HoldemAction | null>(null);
  const tape = useSessionTape({
    game: "holdem",
    buyIn: stack,
    label: "Hold'em",
    describe: describeHoldem,
    view: viewHoldem,
    acting: actingHoldem,
  });
  const dispatch = (action: HoldemAction) => {
    actionRef.current = action;
    rawDispatch(action);
  };
  const you = state.seats[0]!;

  useEffect(() => {
    const action = actionRef.current;
    actionRef.current = null;
    tape.commit(action, state);
  }, [state, tape.commit]);

  useEffect(() => {
    onStack(you.stack);
  }, [onStack, you.stack]);

  useEffect(() => {
    if (state.phase !== "showdown") return;
    recordHand({
      game: "holdem",
      summary: state.status,
      seats: state.seats.map((seat, index) => ({
        name: seat.name,
        delta: (state.gains[index] ?? 0) - seat.committed,
        note: seat.folded ? "Folded" : (state.handNames[index] ?? "Won uncontested"),
      })),
    });
  }, [state.phase, state.status, state.gains, state.seats, state.handNames]);

  useEffect(() => {
    if (state.phase === "betting" && state.toAct > 0) {
      const timer = window.setTimeout(() => dispatch({ type: "ai" }), 700);
      return () => window.clearTimeout(timer);
    }
    if (state.phase === "runout") {
      const timer = window.setTimeout(() => dispatch({ type: "runout" }), 750);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [state]);

  const options = actorOptions(state);

  return (
    <TableFrame
      title="Hold'em"
      eyebrow={streetLabel(state.street)}
      stack={you.stack}
      cage={cage}
      onLeave={() => {
        void Promise.race([tape.close(you.stack), new Promise((resolve) => window.setTimeout(resolve, 1500))]).finally(() => onLeave(you.stack));
      }}
      onRules={onRules}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Opponent state={state} index={1} />
        <Opponent state={state} index={2} />
      </div>

      <section className="rounded-3xl border border-line bg-felt-light/40 px-3 py-5">
        <p className="text-center font-display text-2xl tabular-nums text-gold">Pot {state.pot}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: 5 }, (_, index) => {
            const card = state.board[index];
            return card ? (
              <PlayingCard key={card.id} card={card} size="md" />
            ) : (
              <div key={index} className="h-24 w-16 rounded-lg border border-dashed border-line" />
            );
          })}
        </div>
      </section>

      <section className="text-center">
        <p className="mb-2 text-sm text-muted">
          You {you.bet > 0 ? `· bet ${you.bet}` : ""}
          {state.button === 0 ? " · dealer" : ""}
          {state.handNames[0] ? ` · ${state.handNames[0]}` : ""}
        </p>
        <CardRow cards={you.hole} size="lg" />
      </section>

      <p className="min-h-6 text-center text-cream" aria-live="polite">
        {state.status}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {options && (
          <>
            {!options.canCheck && (
              <Btn tone="danger" onClick={() => dispatch({ type: "fold" })}>
                Fold
              </Btn>
            )}
            {options.canCheck ? (
              <Btn tone="quiet" onClick={() => dispatch({ type: "check" })}>
                Check
              </Btn>
            ) : (
              <Btn tone="gold" onClick={() => dispatch({ type: "call" })}>
                {options.callAmount >= you.stack && options.callAmount > 0 ? `All in ${options.callAmount}` : `Call ${options.callAmount}`}
              </Btn>
            )}
            {options.raises.map((raise) => (
              <Btn key={raise.label} onClick={() => dispatch({ type: "raiseTo", amount: raise.to })}>
                {raise.label}
              </Btn>
            ))}
          </>
        )}
        {state.phase === "showdown" && (
          <Btn tone="gold" onClick={() => dispatch({ type: "next" })}>
            Next hand
          </Btn>
        )}
        {state.phase === "broke" && (
          <Btn
            tone="gold"
            onClick={() => {
              const moved = onFund(200);
              if (moved > 0) dispatch({ type: "rebuy", amount: moved });
            }}
          >
            {cage >= 200 ? "Rebuy 200" : "Comp and rebuy"}
          </Btn>
        )}
      </div>
    </TableFrame>
  );
}

function Opponent({ state, index }: { state: HoldemState; index: number }) {
  const seat = state.seats[index]!;
  const show = state.revealed && !seat.folded && seat.hole.length === 2;
  return (
    <div className="rounded-2xl border border-line bg-rail/70 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-cream">
          {seat.name}
          {state.button === index ? " · D" : ""}
          {state.toAct === index ? " · to act" : ""}
        </p>
        <p className="tabular-nums text-gold">{seat.stack}</p>
      </div>
      <p className="text-sm text-muted">
        {seat.folded ? "Folded" : seat.bet > 0 ? `Bet ${seat.bet}` : "In"}
        {state.handNames[index] ? ` · ${state.handNames[index]}` : ""}
      </p>
      <div className="mt-2 flex gap-1">
        {show ? (
          seat.hole.map((card) => <PlayingCard key={card.id} card={card} size="sm" />)
        ) : seat.hole.length > 0 && !seat.folded ? (
          <>
            <PlayingCard down size="sm" />
            <PlayingCard down size="sm" />
          </>
        ) : null}
      </div>
    </div>
  );
}
