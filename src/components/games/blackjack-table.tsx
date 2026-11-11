import { useEffect, useRef, useState } from "react";
import { PlayingCard } from "@/components/playing-card";
import { Btn } from "@/components/bits";
import { TableFrame } from "@/components/games/table-frame";
import {
  canDouble,
  canSplit,
  createBlackjack,
  dealerStep,
  reduceBlackjack,
  totalLabel,
  type BjAction,
  type BjState,
} from "@/lib/cards/blackjack";
import { recordHand } from "@/lib/ledger";
import { actingBlackjack, describeBlackjack, useSessionTape, viewBlackjack } from "@/lib/session-tape";

const BETS = [10, 20, 50, 100];

export function BlackjackTable({
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
  const [state, setState] = useState<BjState>(() => createBlackjack(stack));
  const [bet, setBet] = useState(20);
  const bank = useRef(stack);
  const actionRef = useRef<BjAction | { type: "dealer" } | null>(null);
  const tape = useSessionTape({
    game: "blackjack",
    buyIn: stack,
    label: "Blackjack",
    describe: describeBlackjack,
    view: viewBlackjack,
    acting: actingBlackjack,
  });

  useEffect(() => {
    const action = actionRef.current;
    actionRef.current = null;
    tape.commit(action, state);
  }, [state, tape.commit]);

  useEffect(() => {
    onStack(state.stack);
  }, [onStack, state.stack]);

  useEffect(() => {
    if (state.phase !== "done") return;
    const delta = state.stack - bank.current;
    recordHand({
      game: "blackjack",
      summary: state.status || "Hand settled",
      seats: [
        { name: "You", delta, note: state.status },
        {
          name: "Dealer",
          delta: -delta,
          note: state.dealerTotal == null ? "House" : `Total ${state.dealerTotal}`,
        },
      ],
    });
  }, [state.phase, state.status, state.stack, state.dealerTotal]);

  useEffect(() => {
    if (state.stack > 0 && bet > state.stack) setBet(state.stack);
  }, [bet, state.stack]);

  useEffect(() => {
    if (state.phase !== "dealer") return undefined;
    const timer = window.setTimeout(() => {
      actionRef.current = { type: "dealer" };
      setState((current) => dealerStep(current));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state]);

  const act = (action: BjAction) => {
    if (action.type === "deal" && (state.phase === "bet" || state.phase === "done")) bank.current = state.stack;
    actionRef.current = action;
    setState((current) => reduceBlackjack(current, action));
  };
  const dealerShown = state.holeHidden ? state.dealer.slice(0, 1) : state.dealer;

  return (
    <TableFrame
      title="Blackjack"
      eyebrow="Shoe"
      stack={state.stack}
      cage={cage}
      onLeave={() => {
        void Promise.race([tape.close(state.stack), new Promise((resolve) => window.setTimeout(resolve, 1500))]).finally(() => onLeave(state.stack));
      }}
      onRules={onRules}
    >
      <section className="rounded-3xl border border-line bg-felt-light/40 px-3 py-5 text-center">
        <p className="text-sm uppercase tracking-widest text-muted">Dealer</p>
        <div className="mt-3 flex justify-center gap-2">
          {dealerShown.map((card) => (
            <PlayingCard key={card.id} card={card} size="lg" />
          ))}
          {state.holeHidden && state.dealer.length > 1 && <PlayingCard down size="lg" />}
        </div>
        <p className="mt-2 text-cream">
          {state.dealer.length === 0
            ? "Waiting for a bet"
            : state.holeHidden
              ? "Hole card down"
              : totalLabel(state.dealer)}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {state.hands.map((hand, index) => (
          <section
            key={index}
            className={`rounded-2xl border p-3 text-center ${index === state.active && state.phase === "player" ? "border-gold bg-rail" : "border-line bg-rail/60"}`}
          >
            <p className="text-sm text-muted">
              {state.hands.length > 1 ? `Hand ${index + 1}` : "Your hand"} · bet {hand.bet}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              {hand.cards.map((card) => (
                <PlayingCard key={card.id} card={card} size="lg" />
              ))}
            </div>
            <p className="mt-2 text-cream">{hand.cards.length ? totalLabel(hand.cards) : ""}</p>
          </section>
        ))}
      </div>

      <p className="min-h-6 text-center text-cream" aria-live="polite">
        {state.status}
      </p>

      {(state.phase === "bet" || state.phase === "done") && (
        <div className="flex flex-wrap justify-center gap-2">
          {BETS.map((amount) => (
            <Btn key={amount} tone={bet === amount ? "gold" : "quiet"} disabled={amount > state.stack} onClick={() => setBet(amount)}>
              {amount}
            </Btn>
          ))}
          <Btn
            tone="gold"
            disabled={bet < 1 || bet > state.stack}
            onClick={() => act({ type: "deal", bet: Math.min(bet, state.stack) })}
          >
            Deal {Math.min(bet, state.stack)}
          </Btn>
        </div>
      )}

      {state.phase === "insurance" && (
        <div className="flex justify-center gap-2">
          <Btn onClick={() => act({ type: "insurance", take: false })}>Decline</Btn>
          <Btn tone="gold" disabled={state.stack < Math.floor((state.hands[0]?.bet ?? 0) / 2)} onClick={() => act({ type: "insurance", take: true })}>
            Insure
          </Btn>
        </div>
      )}

      {state.phase === "player" && (
        <div className="flex flex-wrap justify-center gap-2">
          <Btn tone="gold" onClick={() => act({ type: "hit" })}>
            Hit
          </Btn>
          <Btn onClick={() => act({ type: "stand" })}>Stand</Btn>
          <Btn disabled={!canDouble(state)} onClick={() => act({ type: "double" })}>
            Double
          </Btn>
          <Btn disabled={!canSplit(state)} onClick={() => act({ type: "split" })}>
            Split
          </Btn>
        </div>
      )}

      {state.phase === "broke" && (
        <div className="flex justify-center">
          <Btn
            tone="gold"
            onClick={() => {
              const moved = onFund(100);
              if (moved > 0) {
                actionRef.current = { type: "rebuy", amount: moved };
                setState((current) => reduceBlackjack(current, { type: "rebuy", amount: moved }));
              }
            }}
          >
            {cage >= 100 ? "Rebuy 100" : "Comp and rebuy"}
          </Btn>
        </div>
      )}
    </TableFrame>
  );
}
