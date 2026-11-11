import { useEffect, useReducer, useRef, useState } from "react";
import { CardRow, PlayingCard } from "@/components/playing-card";
import { Btn } from "@/components/bits";
import { TableFrame } from "@/components/games/table-frame";
import { tongitsRank, type Card } from "@/lib/cards/model";
import {
  discardTakes,
  isValidMeld,
  readHand,
  reduceTongits,
  sapawTargets,
  createTongits,
  type TongAction,
  type TongState,
} from "@/lib/cards/tongits";
import { recordHand } from "@/lib/ledger";
import { actingTongits, describeTongits, useSessionTape, viewTongits } from "@/lib/session-tape";

function bySuit(cards: Card[]): Card[] {
  const order = { s: 0, h: 1, c: 2, d: 3 };
  return cards.slice().sort((a, b) => order[a.suit] - order[b.suit] || tongitsRank(a) - tongitsRank(b));
}

export function TongitsTable({
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
  const [state, rawDispatch] = useReducer(reduceTongits, stack, createTongits);
  const actionRef = useRef<TongAction | null>(null);
  const tape = useSessionTape({
    game: "tongits",
    buyIn: stack,
    label: "Tong-its",
    describe: describeTongits,
    view: viewTongits,
    acting: actingTongits,
  });
  const dispatch = (action: TongAction) => {
    actionRef.current = action;
    rawDispatch(action);
  };
  const [selected, setSelected] = useState<string[]>([]);
  const you = state.players[0]!;

  useEffect(() => {
    const action = actionRef.current;
    actionRef.current = null;
    tape.commit(action, state);
  }, [state, tape.commit]);

  useEffect(() => {
    onStack(you.stack);
  }, [onStack, you.stack]);

  useEffect(() => {
    if (state.phase !== "done" || !state.result) return;
    recordHand({
      game: "tongits",
      summary: state.result.title,
      seats: state.result.rows.map((row) => ({ name: row.name, delta: row.delta, note: row.detail })),
    });
  }, [state.phase, state.result]);
  const yours = you.hand.map((card) => card.id).join();

  useEffect(() => {
    setSelected((current) => current.filter((id) => you.hand.some((card) => card.id === id)));
  }, [yours, you.hand]);

  useEffect(() => {
    if (state.phase !== "act" || state.players[state.turn]?.human) return undefined;
    const timer = window.setTimeout(() => dispatch({ type: "bot" }), 800);
    return () => window.clearTimeout(timer);
  }, [state]);

  const yourTurn = state.phase === "act" && state.turn === 0;
  const picked = you.hand.filter((card) => selected.includes(card.id));
  const top = state.discard.at(-1);
  const takes = yourTurn && state.need === "draw" && top ? discardTakes(you.hand, top) : [];
  const read = readHand(you.hand);
  const sapaws = yourTurn && state.need === "play" && picked.length === 1 ? sapawTargets(state, picked[0]!) : [];

  function toggle(card: Card) {
    setSelected((current) => (current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]));
  }

  return (
    <TableFrame
      title="Tong-its"
      eyebrow={`Pot ${state.pot}`}
      stack={you.stack}
      cage={cage}
      onLeave={() => {
        void Promise.race([tape.close(you.stack), new Promise((resolve) => window.setTimeout(resolve, 1500))]).finally(() => onLeave(you.stack));
      }}
      onRules={onRules}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Rival state={state} index={1} />
        <Rival state={state} index={2} />
      </div>

      <section className="flex items-end justify-center gap-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted">Stock {state.stock.length}</p>
          <div className="mt-2 flex justify-center">
            {state.stock.length > 0 ? <PlayingCard down size="sm" /> : <div className="h-16 w-11 rounded-md border border-dashed border-line" />}
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted">Discard</p>
          <div className="mt-2 flex justify-center">
            {top ? <PlayingCard card={top} size="sm" /> : <div className="h-16 w-11 rounded-md border border-dashed border-line" />}
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-center text-sm text-muted">
          Your drops · unmatched {read.deadwood}
          {you.locked ? " · a lay-off locked your fight" : ""}
          {you.melds.length === 0 ? " · no open meld yet" : ""}
        </p>
        <Melds melds={you.melds} />
      </section>

      <section>
        <CardRow cards={bySuit(you.hand)} size="sm" selected={new Set(selected)} onToggle={yourTurn && state.need === "play" ? toggle : undefined} />
      </section>

      <p className="min-h-6 text-center text-cream" aria-live="polite">
        {state.status}
      </p>

      {state.phase === "answer" && state.pending[0] && (
        <div className="flex flex-wrap justify-center gap-2">
          <Btn tone="gold" onClick={() => dispatch({ type: "answer", fight: true })}>
            Fight · count {read.deadwood}
          </Btn>
          <Btn tone="danger" onClick={() => dispatch({ type: "answer", fight: false })}>
            Fold
          </Btn>
        </div>
      )}

      {yourTurn && state.need === "draw" && (
        <div className="sticky bottom-0 z-20 -mx-3 flex flex-wrap justify-center gap-2 border-t border-line bg-felt px-3 py-3">
          <Btn tone="gold" onClick={() => dispatch({ type: "draw" })}>
            {state.stock.length ? "Draw" : "Show hands"}
          </Btn>
          {takes.map((meld) => (
            <Btn key={meld.map((card) => card.id).join("-")} onClick={() => dispatch({ type: "take", handIds: meld.map((card) => card.id) })}>
              Take with {meld.map((card) => card.id).join(" ")}
            </Btn>
          ))}
          <Btn
            disabled={you.melds.length === 0 || you.locked}
            onClick={() => dispatch({ type: "fight" })}
          >
            Fight
          </Btn>
        </div>
      )}

      {yourTurn && state.need === "play" && (
        <div className="sticky bottom-0 z-20 -mx-3 flex flex-wrap justify-center gap-2 border-t border-line bg-felt px-3 py-3">
          <Btn
            tone="quiet"
            disabled={!isValidMeld(picked)}
            onClick={() => {
              dispatch({ type: "expose", ids: picked.map((card) => card.id) });
              setSelected([]);
            }}
          >
            Drop meld
          </Btn>
          {sapaws.map((target) => (
            <Btn
              key={`${target.owner}-${target.meld}`}
              onClick={() => {
                dispatch({ type: "sapaw", id: picked[0]!.id, owner: target.owner, meld: target.meld });
                setSelected([]);
              }}
            >
              Lay on {target.name}
            </Btn>
          ))}
          <Btn
            tone="gold"
            disabled={read.deadwood !== 0 || you.hand.length === 0}
            onClick={() => dispatch({ type: "tongits" })}
          >
            Tong-its
          </Btn>
          <Btn
            tone="gold"
            disabled={picked.length !== 1}
            onClick={() => {
              dispatch({ type: "discard", id: picked[0]!.id });
              setSelected([]);
            }}
          >
            {you.hand.length === 1 ? "Discard and Tong-its" : "Discard"}
          </Btn>
        </div>
      )}

      {state.phase === "done" && state.result && (
        <section className="rounded-2xl border border-line bg-rail p-4">
          <h2 className="font-display text-2xl">{state.result.title}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {state.result.rows.map((row) => (
              <li key={row.name} className="flex justify-between gap-3 tabular-nums">
                <span>
                  {row.name} · {row.detail}
                </span>
                <span className={row.delta >= 0 ? "text-gold" : "text-suit"}>
                  {row.delta >= 0 ? "+" : ""}
                  {row.delta}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Btn tone="gold" onClick={() => dispatch({ type: "next" })}>
              Next hand
            </Btn>
          </div>
        </section>
      )}

      {state.phase === "broke" && (
        <div className="flex justify-center">
          <Btn
            tone="gold"
            onClick={() => {
              const moved = onFund(120);
              if (moved > 0) dispatch({ type: "rebuy", amount: moved });
            }}
          >
            {cage >= 120 ? "Rebuy 120" : "Comp and rebuy"}
          </Btn>
        </div>
      )}
    </TableFrame>
  );
}

function Rival({ state, index }: { state: TongState; index: number }) {
  const player = state.players[index]!;
  const show = state.phase === "done";
  return (
    <div className={`rounded-2xl border p-3 ${state.turn === index && state.phase === "act" ? "border-gold bg-rail" : "border-line bg-rail/70"}`}>
      <div className="flex items-baseline justify-between">
        <p className="font-medium">
          {player.name}
          {state.dealer === index ? " · dealer" : ""}
        </p>
        <p className="tabular-nums text-gold">{player.stack}</p>
      </div>
      <p className="text-sm text-muted">
        {player.hand.length} in hand
        {player.melds.length === 0 ? " · not yet in" : ` · ${player.melds.length} meld${player.melds.length === 1 ? "" : "s"}`}
        {player.locked ? " · locked" : ""}
      </p>
      <Melds melds={player.melds} />
      {show && player.hand.length > 0 && (
        <div className="mt-2">
          <CardRow cards={bySuit(player.hand)} size="sm" />
        </div>
      )}
    </div>
  );
}

function Melds({ melds }: { melds: Card[][] }) {
  if (melds.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {melds.map((meld, index) => (
        <CardRow key={meld.map((card) => card.id).join("-") || index} cards={bySuit(meld)} size="sm" overlap />
      ))}
    </div>
  );
}
