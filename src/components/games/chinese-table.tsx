import { useEffect, useReducer, useRef, useState } from "react";
import { CardRow, PlayingCard } from "@/components/playing-card";
import { Btn } from "@/components/bits";
import { TableFrame } from "@/components/games/table-frame";
import { better, rankFive, rankFront } from "@/lib/cards/eval";
import { type Card } from "@/lib/cards/model";
import {
  arrangementIssue,
  arrangeOptimal,
  createChinese,
  describeArrangement,
  reduceChinese,
  royaltyLabel,
  type Arrangement,
  type ChineseAction,
  type ChineseState,
} from "@/lib/cards/chinese";
import { recordHand } from "@/lib/ledger";
import { actingChinese, describeChinese, useSessionTape, viewChinese } from "@/lib/session-tape";

type RowName = "back" | "middle" | "front";

const CAPS: Record<RowName, number> = { back: 5, middle: 5, front: 3 };

function byRank(cards: Card[]): Card[] {
  const ranks = new Set(cards.map((card) => card.rank));
  const wheel = cards.length === 5 && ranks.has(14) && ranks.has(2) && ranks.has(3) && ranks.has(4) && ranks.has(5);
  return cards.slice().sort((a, b) => {
    const left = wheel && a.rank === 14 ? 1 : a.rank;
    const right = wheel && b.rank === 14 ? 1 : b.rank;
    return right - left;
  });
}

export function ChineseTable({
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
  const [state, rawDispatch] = useReducer(reduceChinese, stack, createChinese);
  const actionRef = useRef<ChineseAction | null>(null);
  const tape = useSessionTape({
    game: "chinese",
    buyIn: stack,
    label: "Chinese poker",
    describe: describeChinese,
    view: viewChinese,
    acting: actingChinese,
  });
  const dispatch = (action: ChineseAction) => {
    actionRef.current = action;
    rawDispatch(action);
  };
  const [rows, setRows] = useState<Arrangement>({ front: [], middle: [], back: [] });
  const [which, setWhich] = useState<RowName>("back");
  const [busy, setBusy] = useState(false);
  const you = state.players[0]!;
  const dealKey = you.cards.map((card) => card.id).join();

  useEffect(() => {
    const action = actionRef.current;
    actionRef.current = null;
    tape.commit(action, state);
  }, [state, tape.commit]);

  useEffect(() => {
    onStack(you.stack);
  }, [onStack, you.stack]);

  useEffect(() => {
    if (state.phase !== "reveal" || !state.result) return;
    recordHand({
      game: "chinese",
      summary: state.result.lines.join(" "),
      seats: state.result.rows.map((row) => ({ name: row.name, delta: row.delta, note: row.detail })),
    });
  }, [state.phase, state.result]);

  useEffect(() => {
    setRows({ front: [], middle: [], back: [] });
    setWhich("back");
    setBusy(false);
  }, [dealKey]);

  const placed = new Set([...rows.front, ...rows.middle, ...rows.back].map((card) => card.id));
  const loose = byRank(you.cards.filter((card) => !placed.has(card.id)));
  const filled = rows.front.length === 3 && rows.middle.length === 5 && rows.back.length === 5;
  const issue = filled ? arrangementIssue(rows) : "Place all thirteen cards.";
  const names = filled ? describeArrangement(rows) : null;

  function put(card: Card) {
    setRows((current) => {
      if (current[which].length >= CAPS[which]) return current;
      return { ...current, [which]: [...current[which], card] };
    });
  }

  function lift(row: RowName, id: string) {
    setRows((current) => ({ ...current, [row]: current[row].filter((card) => card.id !== id) }));
  }

  return (
    <TableFrame
      title="Chinese poker"
      eyebrow="Thirteen cards"
      stack={you.stack}
      cage={cage}
      onLeave={() => {
        void Promise.race([tape.close(you.stack), new Promise((resolve) => window.setTimeout(resolve, 1500))]).finally(() => onLeave(you.stack));
      }}
      onRules={onRules}
    >
      {state.phase === "arrange" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(["back", "middle", "front"] as const).map((row) => (
              <button
                key={row}
                type="button"
                onClick={() => setWhich(row)}
                className={`min-h-11 rounded-full border px-2 text-sm capitalize ${which === row ? "border-gold bg-gold text-ink" : "border-line text-cream"}`}
              >
                {row} {rows[row].length}/{CAPS[row]}
              </button>
            ))}
          </div>

          {(["back", "middle", "front"] as const).map((row) => (
            <section key={row} className={`rounded-2xl border p-3 ${which === row ? "border-gold" : "border-line"}`}>
              <p className="mb-2 text-sm capitalize text-muted">
                {row}
                {names ? ` · ${names[row]}` : ""}
              </p>
              <div className="flex min-h-16 flex-wrap gap-1">
                {byRank(rows[row]).map((card) => (
                  <PlayingCard key={card.id} card={card} size="sm" onClick={() => lift(row, card.id)} />
                ))}
                {Array.from({ length: CAPS[row] - rows[row].length }, (_, index) => (
                  <div key={index} className="h-16 w-11 rounded-md border border-dashed border-line" />
                ))}
              </div>
            </section>
          ))}

          <section>
            <p className="mb-2 text-center text-sm text-muted">Tap a card to place it in {which}.</p>
            <CardRow cards={loose} size="sm" onToggle={put} />
          </section>

          <p className={`text-center ${issue && filled ? "text-suit" : "text-cream"}`}>{busy ? "Setting the hand…" : issue ?? "Legal hand."}</p>
          {filled && !issue && royaltyLabel(rows) && <p className="text-center text-sm text-gold">Royalties {royaltyLabel(rows)}</p>}

          <div className="sticky bottom-0 z-20 -mx-3 flex flex-wrap justify-center gap-2 border-t border-line bg-felt px-3 py-3">
            <Btn
              disabled={busy}
              onClick={() => {
                setBusy(true);
                window.setTimeout(() => {
                  const arranged = arrangeOptimal(you.cards);
                  setRows(arranged.arrangement);
                  setBusy(false);
                }, 30);
              }}
            >
              Suggest
            </Btn>
            <Btn
              onClick={() => {
                setRows({ front: [], middle: [], back: [] });
              }}
            >
              Clear
            </Btn>
            <Btn tone="gold" disabled={!filled || busy} onClick={() => dispatch({ type: "submit", arrangement: rows })}>
              {!filled || issue ? (issue && filled ? "Show a foul" : "Show hands") : "Show hands"}
            </Btn>
          </div>
        </>
      )}

      {state.phase === "reveal" && state.result && (
        <>
          <div className="grid gap-3">
            {state.players.map((player, index) => (
              <Reveal key={player.name} state={state} index={index} />
            ))}
          </div>
          <ul className="space-y-1 text-sm">
            {state.result.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="space-y-1 text-sm tabular-nums">
            {state.result.rows.map((row) => (
              <li key={row.name} className="flex justify-between">
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
          <div className="flex justify-center">
            <Btn tone="gold" onClick={() => dispatch({ type: "next" })}>
              Next hand
            </Btn>
          </div>
        </>
      )}

      {state.phase === "broke" && (
        <div className="flex justify-center">
          <Btn
            tone="gold"
            onClick={() => {
              const moved = onFund(200);
              if (moved > 0) dispatch({ type: "rebuy", amount: moved });
            }}
          >
            {cage >= 200 ? "Rebuy 200" : "Comp and rebuy"}
          </Btn>
        </div>
      )}

      <p className="text-center text-sm text-muted" aria-live="polite">
        {state.status}
      </p>
    </TableFrame>
  );
}

function Reveal({ state, index }: { state: ChineseState; index: number }) {
  const player = state.players[index]!;
  const hand = player.set;
  if (!hand || player.foul) {
    return (
      <section className="rounded-2xl border border-suit bg-rail p-3">
        <header className="flex justify-between">
          <h2 className="font-display text-2xl">{player.name}</h2>
          <p className="text-suit">Foul</p>
        </header>
      </section>
    );
  }
  const described = describeArrangement(hand);
  return (
    <section className="rounded-2xl border border-line bg-rail p-3">
      <header className="mb-2 flex justify-between">
        <h2 className="font-display text-2xl">{player.name}</h2>
        <p className="text-sm text-gold">{royaltyLabel(hand) || "No royalty"}</p>
      </header>
      <Line label="Back" cards={hand.back} note={described.back} best={bestRow(state, "back", index)} />
      <Line label="Middle" cards={hand.middle} note={described.middle} best={bestRow(state, "middle", index)} />
      <Line label="Front" cards={hand.front} note={described.front} best={bestRow(state, "front", index)} />
    </section>
  );
}

function bestRow(state: ChineseState, row: RowName, index: number): boolean {
  const ranks = state.players.map((player) => {
    if (!player.set || player.foul) return null;
    if (row === "front") return rankFront(player.set.front);
    if (row === "middle") return rankFive(player.set.middle);
    return rankFive(player.set.back);
  });
  const mine = ranks[index];
  if (!mine) return false;
  return ranks.every((rank) => !rank || better(mine, rank) >= 0);
}

function Line({ label, cards, note, best }: { label: string; cards: Card[]; note: string; best: boolean }) {
  return (
    <div className={`mt-2 rounded-xl px-2 py-2 ${best ? "bg-felt-light" : ""}`}>
      <p className="text-sm text-muted">
        {label} · {note}
        {best ? " · best" : ""}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {byRank(cards).map((card) => (
          <PlayingCard key={card.id} card={card} size="sm" />
        ))}
      </div>
    </div>
  );
}
