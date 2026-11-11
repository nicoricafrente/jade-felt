import { useCallback, useEffect, useRef } from "react";
import type { BjState } from "@/lib/cards/blackjack";
import { totalLabel } from "@/lib/cards/blackjack";
import { cardName, type Card } from "@/lib/cards/model";
import { describeArrangement, type ChineseState } from "@/lib/cards/chinese";
import type { HoldemAction, HoldemState } from "@/lib/cards/holdem";
import { streetLabel } from "@/lib/cards/holdem";
import type { TongState } from "@/lib/cards/tongits";
import { appendSessionEvents, closeSession, openSession } from "@/lib/session-tape.functions";
import type { TapeCard, TapeMove, TapeView } from "@/lib/session-tape.types";
import type { GameId } from "@/lib/wallet";

type Options<S> = {
  game: GameId;
  buyIn: number;
  label: string;
  describe: (action: unknown, before: S | null, after: S) => TapeMove[];
  view: (state: S) => TapeView;
  acting: (state: S) => string | null;
};

type Queued = TapeMove & { id: string; at: number; view: TapeView };

function eid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pack(event: Queued) {
  return {
    id: event.id,
    at: event.at,
    actor: event.actor.slice(0, 40),
    kind: event.kind,
    detail: event.detail.slice(0, 500),
    view: { ...event.view, title: event.view.title.slice(0, 300) },
  };
}

function voice(actor: string, detail: string): string {
  if (actor !== "You") return detail;
  return detail
    .replace(/^You folds\b/, "You fold")
    .replace(/^You checks\b/, "You check")
    .replace(/^You calls\b/, "You call")
    .replace(/^You raises\b/, "You raise")
    .replace(/^You draws\b/, "You draw")
    .replace(/^You throws\b/, "You throw")
    .replace(/^You takes\b/, "You take")
    .replace(/^You drops\b/, "You drop")
    .replace(/^You lays\b/, "You lay");
}

function isType(action: unknown, type: string): boolean {
  return !!action && typeof action === "object" && "type" in action && (action as { type: string }).type === type;
}

function up(card: Card): TapeCard {
  return { id: card.id, rank: card.rank, suit: card.suit };
}

function down(card: Card): TapeCard {
  return { id: card.id, rank: card.rank, suit: card.suit, down: true };
}

function named(cards: Card[]): string {
  return cards.map((card) => cardName(card)).join(", ");
}

function pushShowdown(beforePhase: string, afterPhase: string, status: string, moves: TapeMove[]) {
  if (beforePhase === afterPhase) return;
  if (afterPhase !== "done" && afterPhase !== "showdown") return;
  if (moves.some((move) => move.kind === "showdown")) return;
  moves.push({ kind: "showdown", actor: "Dealer", detail: status || "Hand over." });
}

export function describeHoldem(action: unknown, before: HoldemState | null, after: HoldemState): TapeMove[] {
  if (!before || isType(action, "mount")) {
    const mine = after.seats[0]?.hole ?? [];
    return [
      {
        kind: "deal",
        actor: "Dealer",
        detail: mine.length ? `Cards dealt. You have ${named(mine)}.` : "Cards dealt.",
      },
    ];
  }
  const moves: TapeMove[] = [];
  const seat = before.seats[before.toAct];
  const name = seat?.name ?? "You";
  if (isType(action, "rebuy")) {
    const amount = (action as { amount?: number }).amount ?? 0;
    moves.push({ kind: "deposit", actor: "You", detail: `Deposited ${amount} onto the table.` });
    return moves;
  }
  if (isType(action, "next")) {
    const mine = after.seats[0]?.hole ?? [];
    moves.push({
      kind: "next",
      actor: "Dealer",
      detail: mine.length ? `Next hand. You have ${named(mine)}.` : "Next hand dealt.",
    });
    return moves;
  }
  if (isType(action, "runout")) {
    const added = after.board.slice(before.board.length);
    moves.push({
      kind: "draw",
      actor: "Dealer",
      detail: added.length ? `${streetLabel(after.street)} drawn: ${named(added)}.` : "The board moves.",
    });
    pushShowdown(before.phase, after.phase, after.status, moves);
    return moves;
  }
  if (isType(action, "fold")) moves.push({ kind: "fold", actor: name, detail: `${name} folds.` });
  else if (isType(action, "check")) moves.push({ kind: "check", actor: name, detail: `${name} checks.` });
  else if (isType(action, "call")) {
    const paid = (after.seats[before.toAct]?.bet ?? 0) - (before.seats[before.toAct]?.bet ?? 0);
    moves.push({ kind: "call", actor: name, detail: paid > 0 ? `${name} calls ${paid}.` : `${name} calls.` });
  } else if (isType(action, "raiseTo")) {
    const amount = (action as HoldemAction & { amount?: number }).amount ?? after.seats[before.toAct]?.bet ?? 0;
    moves.push({ kind: "raise", actor: name, detail: `${name} raises to ${amount}.` });
  } else if (isType(action, "ai") && seat) {
    const next = after.seats[before.toAct];
    if (next?.folded && !seat.folded) moves.push({ kind: "fold", actor: name, detail: `${name} folds.` });
    else if (next && next.bet > before.currentBet && next.bet > seat.bet) {
      moves.push({ kind: "raise", actor: name, detail: `${name} raises to ${next.bet}.` });
    } else if (next && next.bet > seat.bet) {
      const paid = next.bet - seat.bet;
      moves.push({ kind: "call", actor: name, detail: `${name} calls ${paid}.` });
    } else moves.push({ kind: "check", actor: name, detail: `${name} checks.` });
  }
  pushShowdown(before.phase, after.phase, after.status, moves);
  return moves;
}

export function viewHoldem(state: HoldemState): TapeView {
  return {
    game: "holdem",
    title: state.status,
    pot: state.pot,
    board: state.board.map(up),
    discard: [],
    seats: state.seats.map((seat, index) => ({
      name: seat.name,
      stack: seat.stack,
      bet: seat.bet,
      acting: state.phase === "betting" && state.toAct === index && !seat.folded,
      folded: seat.folded,
      tag: state.handNames[index] ?? (state.button === index ? "Dealer" : ""),
      cards: (state.revealed || seat.human) && !seat.folded ? seat.hole.map(up) : seat.hole.map(down),
      melds: [],
    })),
  };
}

export function actingHoldem(state: HoldemState): string | null {
  if (state.phase !== "betting") return null;
  const seat = state.seats[state.toAct];
  if (!seat || seat.folded || seat.allIn) return null;
  return seat.name;
}

export function describeBlackjack(action: unknown, before: BjState | null, after: BjState): TapeMove[] {
  if (!before || isType(action, "mount")) return [];
  const moves: TapeMove[] = [];
  if (isType(action, "rebuy")) {
    const amount = (action as { amount?: number }).amount ?? 0;
    moves.push({ kind: "deposit", actor: "You", detail: `Deposited ${amount} onto the table.` });
    return moves;
  }
  if (isType(action, "deal")) {
    const bet = (action as { bet?: number }).bet ?? 0;
    const yours = after.hands.flatMap((hand) => hand.cards);
    const upCard = after.dealer[0];
    moves.push({
      kind: "deal",
      actor: "Dealer",
      detail: `You bet ${bet}. Drew ${named(yours)}. Dealer shows ${upCard ? cardName(upCard) : "a card"}.`,
    });
  } else if (isType(action, "insurance")) {
    const take = (action as { take?: boolean }).take === true;
    moves.push({
      kind: "insurance",
      actor: "You",
      detail: take ? "You take insurance." : "You decline insurance.",
    });
  } else if (isType(action, "hit")) {
    const hand = after.hands[before.active];
    const card = hand?.cards.at(-1);
    moves.push({ kind: "hit", actor: "You", detail: card ? `You hit. Drew ${cardName(card)}.` : "You hit." });
  } else if (isType(action, "stand")) {
    moves.push({ kind: "stand", actor: "You", detail: "You stand." });
  } else if (isType(action, "double")) {
    const hand = after.hands[before.active];
    const card = hand?.cards.at(-1);
    moves.push({
      kind: "double",
      actor: "You",
      detail: card ? `You double. Drew ${cardName(card)}.` : "You double.",
    });
  } else if (isType(action, "split")) {
    moves.push({ kind: "split", actor: "You", detail: "You split." });
  } else if (isType(action, "dealer")) {
    const drawn = after.dealer.slice(before.dealer.length);
    const flipped = before.holeHidden && !after.holeHidden ? before.dealer[1] : undefined;
    const bits: string[] = [];
    if (flipped) bits.push(`Dealer turns ${cardName(flipped)}.`);
    if (drawn.length) bits.push(`Dealer draws ${named(drawn)}.`);
    if (!bits.length) bits.push(after.status || "Dealer stands.");
    moves.push({ kind: drawn.length ? "draw" : "stand", actor: "Dealer", detail: bits.join(" ") });
  }
  pushShowdown(before.phase, after.phase, after.status, moves);
  return moves;
}

export function viewBlackjack(state: BjState): TapeView {
  const dealerCards = state.dealer.map((card, index) => (state.holeHidden && index > 0 ? down(card) : up(card)));
  const hands = state.hands.length
    ? state.hands.map((hand, index) => ({
        name: state.hands.length > 1 && index > 0 ? `Hand ${index + 1}` : "You",
        stack: index === 0 ? state.stack : 0,
        bet: hand.bet,
        acting: state.phase === "player" && state.active === index && !hand.done,
        folded: false,
        tag: hand.cards.length ? totalLabel(hand.cards) : "",
        cards: hand.cards.map(up),
        melds: [] as TapeCard[][],
      }))
    : [
        {
          name: "You",
          stack: state.stack,
          bet: 0,
          acting: state.phase === "bet" || state.phase === "done",
          folded: false,
          tag: "",
          cards: [] as TapeCard[],
          melds: [] as TapeCard[][],
        },
      ];
  return {
    game: "blackjack",
    title: state.status,
    pot: state.hands.reduce((sum, hand) => sum + hand.bet, 0) + state.insurance,
    board: [],
    discard: [],
    seats: [
      {
        name: "Dealer",
        stack: 0,
        bet: 0,
        acting: state.phase === "dealer",
        folded: false,
        tag: state.dealerTotal == null ? "" : `Total ${state.dealerTotal}`,
        cards: dealerCards,
        melds: [],
      },
      ...hands,
    ],
  };
}

export function actingBlackjack(state: BjState): string | null {
  if (state.phase === "broke") return null;
  if (state.phase === "dealer") return "Dealer";
  return "You";
}

export function describeTongits(action: unknown, before: TongState | null, after: TongState): TapeMove[] {
  if (!before || isType(action, "mount")) {
    const mine = after.players[0]?.hand ?? [];
    return [{ kind: "deal", actor: "Dealer", detail: mine.length ? `Dealt ${named(mine)}.` : "Cards dealt." }];
  }
  const moves: TapeMove[] = [];
  if (isType(action, "rebuy")) {
    const amount = (action as { amount?: number }).amount ?? 0;
    moves.push({ kind: "deposit", actor: "You", detail: `Deposited ${amount} onto the table.` });
    return moves;
  }
  if (isType(action, "next")) {
    const mine = after.players[0]?.hand ?? [];
    moves.push({
      kind: "next",
      actor: "Dealer",
      detail: mine.length ? `Next hand. Dealt ${named(mine)}.` : "Next hand dealt.",
    });
    return moves;
  }
  if (isType(action, "bot")) {
    botMoves(before, after, moves);
    pushShowdown(before.phase, after.phase, after.result?.title ?? after.status, moves);
    return moves;
  }
  const you = "You";
  if (isType(action, "draw")) {
    const card = before.stock.at(-1);
    moves.push({
      kind: "draw",
      actor: you,
      detail: after.stock.length < before.stock.length && card ? `You draw ${cardName(card)}.` : "You draw.",
    });
  } else if (isType(action, "discard")) {
    const id = (action as { id?: string }).id;
    const card = before.players[0]?.hand.find((held) => held.id === id);
    moves.push({ kind: "discard", actor: you, detail: card ? `You throw ${cardName(card)}.` : "You throw a card." });
  } else if (isType(action, "expose")) {
    moves.push({ kind: "expose", actor: you, detail: "You drop a meld." });
  } else if (isType(action, "sapaw")) {
    const id = (action as { id?: string }).id;
    const card = before.players[0]?.hand.find((held) => held.id === id);
    const owner = (action as { owner?: number }).owner ?? 0;
    const who = before.players[owner]?.name ?? "a meld";
    moves.push({
      kind: "sapaw",
      actor: you,
      detail: card ? `You lay ${cardName(card)} on ${who}'s meld.` : `You lay a card on ${who}'s meld.`,
    });
  } else if (isType(action, "take")) {
    const top = before.discard.at(-1);
    moves.push({ kind: "draw", actor: you, detail: top ? `You take ${cardName(top)}.` : "You take the discard." });
    moves.push({ kind: "expose", actor: you, detail: "You drop a meld." });
  } else if (isType(action, "fight")) {
    moves.push({ kind: "fight", actor: you, detail: "You call a fight." });
  } else if (isType(action, "answer")) {
    const fight = (action as { fight?: boolean }).fight === true;
    moves.push({
      kind: fight ? "answer" : "fold",
      actor: you,
      detail: fight ? "You accept the fight." : "You fold the fight.",
    });
  } else if (isType(action, "tongits")) {
    moves.push({ kind: "tongits", actor: you, detail: "You declare Tong-its." });
  }
  pushShowdown(before.phase, after.phase, after.result?.title ?? after.status, moves);
  return moves;
}

function botMoves(before: TongState, after: TongState, moves: TapeMove[]) {
  const index = before.turn;
  const actor = before.players[index]?.name ?? "Player";
  if (before.phase === "act" && after.phase === "answer") {
    moves.push({ kind: "fight", actor, detail: `${actor} calls a fight.` });
    return;
  }
  if (after.stock.length < before.stock.length) {
    const card = before.stock.at(-1);
    moves.push({ kind: "draw", actor, detail: card ? `${actor} draws ${cardName(card)}.` : `${actor} draws.` });
  } else if (after.discard.length < before.discard.length) {
    const card = before.discard.at(-1);
    moves.push({ kind: "draw", actor, detail: card ? `${actor} takes ${cardName(card)}.` : `${actor} takes the discard.` });
  }
  const prev = before.players[index];
  const next = after.players[index];
  if (prev && next && next.melds.length > prev.melds.length) {
    moves.push({ kind: "expose", actor, detail: `${actor} drops a meld.` });
  }
  let laid = false;
  for (let owner = 0; owner < before.players.length; owner += 1) {
    const oldMelds = before.players[owner]?.melds ?? [];
    const newMelds = after.players[owner]?.melds ?? [];
    for (let meld = 0; meld < oldMelds.length; meld += 1) {
      if ((newMelds[meld]?.length ?? 0) > (oldMelds[meld]?.length ?? 0)) laid = true;
    }
  }
  if (laid) moves.push({ kind: "sapaw", actor, detail: `${actor} lays off a card.` });
  if (after.discard.length > before.discard.length) {
    const card = after.discard.at(-1);
    moves.push({ kind: "discard", actor, detail: card ? `${actor} throws ${cardName(card)}.` : `${actor} throws a card.` });
  }
  if (moves.length === 0) moves.push({ kind: "turn", actor, detail: after.status || `${actor} moves.` });
}

export function viewTongits(state: TongState): TapeView {
  const open = state.phase === "done";
  return {
    game: "tongits",
    title: state.result?.title || state.status,
    pot: state.pot,
    board: [],
    discard: state.discard.slice(-6).map(up),
    seats: state.players.map((player, index) => ({
      name: player.name,
      stack: player.stack,
      bet: 0,
      acting: state.phase === "act" && state.turn === index,
      folded: player.satOut,
      tag: player.locked ? "Locked" : "",
      cards: player.human || open ? player.hand.map(up) : player.hand.map(down),
      melds: player.melds.map((meld) => meld.map(up)),
    })),
  };
}

export function actingTongits(state: TongState): string | null {
  if (state.phase !== "act") return null;
  return state.players[state.turn]?.name ?? null;
}

export function describeChinese(action: unknown, before: ChineseState | null, after: ChineseState): TapeMove[] {
  if (!before || isType(action, "mount")) {
    const mine = after.players[0]?.cards ?? [];
    return [{ kind: "deal", actor: "Dealer", detail: mine.length ? `Dealt ${named(mine)}.` : "Cards dealt." }];
  }
  if (isType(action, "rebuy")) {
    const amount = (action as { amount?: number }).amount ?? 0;
    return [{ kind: "deposit", actor: "You", detail: `Deposited ${amount} onto the table.` }];
  }
  if (isType(action, "next")) {
    const mine = after.players[0]?.cards ?? [];
    return [
      {
        kind: "next",
        actor: "Dealer",
        detail: mine.length ? `Next hand. Dealt ${named(mine)}.` : "Next hand dealt.",
      },
    ];
  }
  if (isType(action, "submit")) {
    const arrangement = (action as { arrangement?: { front: Card[]; middle: Card[]; back: Card[] } }).arrangement;
    const moves: TapeMove[] = [];
    if (arrangement?.front && arrangement.middle && arrangement.back) {
      const names = describeArrangement(arrangement);
      moves.push({
        kind: "submit",
        actor: "You",
        detail: `You set back ${names.back}, middle ${names.middle}, front ${names.front}.`,
      });
    } else {
      moves.push({ kind: "submit", actor: "You", detail: "You set your hand." });
    }
    if (after.phase === "reveal") {
      moves.push({ kind: "reveal", actor: "Dealer", detail: after.result?.title || after.status || "Hands shown." });
    }
    return moves;
  }
  return [];
}

export function viewChinese(state: ChineseState): TapeView {
  const open = state.phase === "reveal";
  return {
    game: "chinese",
    title: state.result?.title || state.status,
    pot: 0,
    board: [],
    discard: [],
    seats: state.players.map((player) => ({
      name: player.name,
      stack: player.stack,
      bet: 0,
      acting: state.phase === "arrange" && player.human,
      folded: player.foul,
      tag: player.foul ? "Foul" : "",
      cards: player.set && open ? [] : player.human || open ? player.cards.map(up) : player.cards.map(down),
      melds:
        player.set && open
          ? [player.set.back.map(up), player.set.middle.map(up), player.set.front.map(up)]
          : [],
    })),
  };
}

export function actingChinese(state: ChineseState): string | null {
  if (state.phase !== "arrange") return null;
  return "You";
}

function withTurn<S>(moves: TapeMove[], acting: (state: S) => string | null, state: S): TapeMove[] {
  const who = acting(state);
  if (!who || moves.some((move) => move.kind === "turn" && move.actor === who)) return moves;
  const last = [...moves].reverse().find((move) => move.kind !== "enter" && move.kind !== "deposit");
  if (last?.actor === who) return moves;
  return [...moves, { kind: "turn", actor: who, detail: who === "You" ? "Your turn." : `${who}'s turn.` }];
}

export function useSessionTape<S>(options: Options<S>) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const beforeRef = useRef<S | null>(null);
  const idRef = useRef<string | null>(null);
  const opening = useRef<Promise<string | null> | null>(null);
  const queue = useRef<Queued[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const closed = useRef(false);
  const mounted = useRef(false);
  const viewRef = useRef<TapeView | null>(null);
  const stackRef = useRef(options.buyIn);

  const ensureOpen = useCallback(async () => {
    if (idRef.current) return idRef.current;
    if (!opening.current) {
      const opts = optionsRef.current;
      opening.current = openSession({ data: { game: opts.game, buyIn: opts.buyIn, label: opts.label } })
        .then((result) => {
          idRef.current = result.id;
          return result.id;
        })
        .catch(() => {
          opening.current = null;
          return null;
        });
    }
    return opening.current;
  }, []);

  const deliver = useCallback(
    (batch: Queued[]) => {
      chain.current = chain.current
        .then(async () => {
          if (batch.length === 0) return;
          const id = await ensureOpen();
          if (!id) {
            queue.current = [...batch, ...queue.current].slice(-500);
            return;
          }
          const saved = await appendSessionEvents({
            data: {
              sessionId: id,
              events: batch.map(pack),
            },
          });
          if (!saved.ok) queue.current = [...batch, ...queue.current].slice(-500);
        })
        .catch(() => {
          queue.current = [...batch, ...queue.current].slice(-500);
        });
      return chain.current;
    },
    [ensureOpen],
  );

  const flush = useCallback(() => {
    if (closed.current) return;
    const batch = queue.current.splice(0, 30);
    if (batch.length === 0) return;
    void deliver(batch);
  }, [deliver]);

  const close = useCallback(
    (stack: number) => {
      if (closed.current) return chain.current;
      closed.current = true;
      const view = viewRef.current;
      const at = Date.now();
      const finals: Queued[] = view
        ? [
            {
              id: eid(),
              at,
              actor: "You",
              kind: "withdraw",
              detail: `Withdrew ${stack} to the cage.`,
              view,
            },
            {
              id: eid(),
              at,
              actor: "You",
              kind: "leave",
              detail: `Left the table with ${stack}.`,
              view,
            },
          ]
        : [];
      const batch = queue.current.splice(0, 500).concat(finals);
      chain.current = chain.current
        .then(async () => {
          const id = await ensureOpen();
          if (!id) return;
          await closeSession({
            data: {
              sessionId: id,
              cashOut: stack,
              events: batch.map(pack),
            },
          });
        })
        .catch(() => undefined);
      return chain.current;
    },
    [ensureOpen],
  );

  const commit = useCallback((action: unknown, state: S) => {
    if (closed.current) return;
    const opts = optionsRef.current;
    const before = beforeRef.current;
    if (before && action == null) return;
    let moves: TapeMove[];
    if (!before) {
      moves = [
        { kind: "enter", actor: "You", detail: `Sat down at ${opts.label}.` },
        { kind: "deposit", actor: "You", detail: `Deposited ${opts.buyIn} from the cage.` },
        ...opts.describe({ type: "mount" }, null, state),
      ];
    } else {
      moves = opts.describe(action, before, state);
    }
    moves = withTurn(moves, opts.acting, state);
    beforeRef.current = state;
    if (moves.length === 0) return;
    const view = opts.view(state);
    viewRef.current = view;
    const you = view.seats.find((seat) => seat.name === "You");
    if (you) stackRef.current = you.stack;
    const at = Date.now();
    queue.current.push(
      ...moves.map((move) => ({
        ...move,
        id: eid(),
        at,
        detail: voice(move.actor, move.detail).slice(0, 500),
        view: { ...view, title: view.title.slice(0, 300) },
      })),
    );
    if (queue.current.length >= 12) {
      const batch = queue.current.splice(0, 30);
      void deliver(batch);
    }
  }, [deliver]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(flush, 700);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.setTimeout(() => {
        if (mounted.current) return;
        close(stackRef.current);
      }, 0);
    };
  }, [close, flush]);

  return { commit, close, stackRef };
}
