import { bestHand, better, type HandRank } from "@/lib/cards/eval";
import { freshDeck, shuffle, type Card } from "@/lib/cards/model";

export const SMALL = 10;
export const BIG = 20;

export type Street = "preflop" | "flop" | "turn" | "river";
export type Phase = "betting" | "runout" | "showdown" | "broke";

export type Seat = {
  name: string;
  human: boolean;
  stack: number;
  hole: Card[];
  bet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
};

export type HoldemState = {
  seats: Seat[];
  button: number;
  deck: Card[];
  board: Card[];
  pot: number;
  street: Street;
  toAct: number;
  currentBet: number;
  minRaise: number;
  phase: Phase;
  status: string;
  log: string[];
  revealed: boolean;
  handNames: (string | null)[];
  gains: number[];
};

export type HoldemAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raiseTo"; amount: number }
  | { type: "ai" }
  | { type: "runout" }
  | { type: "next" }
  | { type: "rebuy"; amount: number };

export type RaiseOption = { label: string; to: number };

export type ActorOptions = {
  canCheck: boolean;
  callAmount: number;
  raises: RaiseOption[];
};

function say(state: HoldemState, line: string) {
  state.status = line;
  state.log = [...state.log, line].slice(-7);
}

function blankSeat(name: string, human: boolean, stack: number): Seat {
  return {
    name,
    human,
    stack,
    hole: [],
    bet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
  };
}

function liveIndexes(state: HoldemState): number[] {
  return state.seats.map((_, index) => index).filter((index) => !state.seats[index]!.folded);
}

function nextActor(state: HoldemState, from: number): number {
  for (let step = 1; step <= 3; step++) {
    const index = (from + step) % 3;
    const seat = state.seats[index]!;
    if (!seat.folded && !seat.allIn) return index;
  }
  return -1;
}

function roundDone(state: HoldemState): boolean {
  if (liveIndexes(state).length <= 1) return true;
  const actors = state.seats.filter((seat) => !seat.folded && !seat.allIn);
  if (actors.length === 0) return true;
  return actors.every((seat) => seat.acted && seat.bet === state.currentBet);
}

function dealStreet(state: HoldemState) {
  for (const seat of state.seats) {
    seat.bet = 0;
    seat.acted = false;
  }
  state.currentBet = 0;
  state.minRaise = BIG;
  const burn = () => state.deck.pop();
  const take = () => {
    const card = state.deck.pop();
    if (!card) throw new Error("The deck ran out.");
    return card;
  };
  if (state.board.length === 0) {
    burn();
    state.board.push(take(), take(), take());
    state.street = "flop";
  } else if (state.board.length === 3) {
    burn();
    state.board.push(take());
    state.street = "turn";
  } else if (state.board.length === 4) {
    burn();
    state.board.push(take());
    state.street = "river";
  }
}

function award(state: HoldemState) {
  const contrib = state.seats.map((seat) => seat.committed);
  const left = contrib.slice();
  const layers: { amount: number; eligible: number[] }[] = [];
  while (left.some((chips) => chips > 0)) {
    const active = left.map((chips, index) => ({ chips, index })).filter((entry) => entry.chips > 0);
    const min = Math.min(...active.map((entry) => entry.chips));
    for (const entry of active) left[entry.index]! -= min;
    const eligible = active.map((entry) => entry.index).filter((index) => !state.seats[index]!.folded);
    layers.push({ amount: min * active.length, eligible });
  }

  const live = liveIndexes(state);
  const show = live.length > 1;
  const ranks = new Map<number, HandRank>();
  state.handNames = [null, null, null];
  if (show) {
    for (const index of live) {
      const rank = bestHand([...state.seats[index]!.hole, ...state.board]);
      ranks.set(index, rank);
      state.handNames[index] = rank.name;
    }
  }

  const gain = [0, 0, 0];
  for (const layer of layers) {
    let eligible = layer.eligible.filter((index) => !state.seats[index]!.folded);
    if (eligible.length === 0) eligible = live.slice();
    if (show) {
      let best: HandRank | null = null;
      let winners: number[] = [];
      for (const index of eligible) {
        const rank = ranks.get(index);
        if (!rank) continue;
        if (!best || better(rank, best) > 0) {
          best = rank;
          winners = [index];
        } else if (better(rank, best) === 0) winners.push(index);
      }
      eligible = winners;
    }
    if (eligible.length === 0) continue;
    const ordered = eligible
      .slice()
      .sort((a, b) => ((a - state.button + 3) % 3) - ((b - state.button + 3) % 3));
    const share = Math.floor(layer.amount / ordered.length);
    let remainder = layer.amount - share * ordered.length;
    for (const index of ordered) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      gain[index]! += share + extra;
    }
  }

  for (let index = 0; index < 3; index++) state.seats[index]!.stack += gain[index]!;
  state.pot = 0;
  state.gains = gain;
  state.revealed = show;
  state.phase = "showdown";
  state.toAct = -1;

  const paid = gain
    .map((chips, index) => (chips > 0 ? `${state.seats[index]!.name} +${chips}` : null))
    .filter(Boolean);
  if (show) {
    const described = live.map((index) => `${state.seats[index]!.name}: ${ranks.get(index)?.name ?? ""}`);
    say(state, `${described.join(" · ")}. ${paid.join(", ")}`);
  } else {
    const winner = live[0] ?? 0;
    say(state, `${state.seats[winner]!.name} wins ${gain[winner] ?? 0}.`);
  }
}

function finishAction(state: HoldemState) {
  if (liveIndexes(state).length <= 1) {
    award(state);
    return;
  }
  if (!roundDone(state)) {
    state.toAct = nextActor(state, state.toAct);
    return;
  }
  if (state.street === "river") {
    award(state);
    return;
  }
  const canAct = state.seats.filter((seat) => !seat.folded && !seat.allIn).length;
  dealStreet(state);
  if (canAct <= 1) {
    state.phase = "runout";
    state.toAct = -1;
    say(state, state.street === "flop" ? "All in. Flop." : `All in. ${labelStreet(state.street)}.`);
    return;
  }
  state.phase = "betting";
  state.toAct = nextActor(state, state.button);
  say(state, `${labelStreet(state.street)}. ${state.seats[state.toAct]?.name ?? ""} to act.`);
}

function labelStreet(street: Street): string {
  if (street === "preflop") return "Preflop";
  if (street === "flop") return "Flop";
  if (street === "turn") return "Turn";
  return "River";
}

function dealHand(state: HoldemState): HoldemState {
  for (const seat of state.seats) {
    if (!seat.human && seat.stack < BIG) seat.stack = 500;
  }
  if (state.seats[0]!.stack <= 0) {
    state.phase = "broke";
    state.toAct = -1;
    state.board = [];
    state.status = "You're out of chips at this table.";
    return state;
  }
  state.button = (state.button + 1) % 3;
  state.deck = shuffle(freshDeck());
  state.board = [];
  state.pot = 0;
  state.street = "preflop";
  state.revealed = false;
  state.handNames = [null, null, null];
  state.gains = [0, 0, 0];
  state.phase = "betting";
  state.minRaise = BIG;
  for (const seat of state.seats) {
    seat.hole = [];
    seat.bet = 0;
    seat.committed = 0;
    seat.folded = seat.stack <= 0;
    seat.allIn = false;
    seat.acted = false;
  }
  const sb = (state.button + 1) % 3;
  const bb = (state.button + 2) % 3;
  post(state, sb, SMALL);
  post(state, bb, BIG);
  state.currentBet = state.seats[bb]!.bet;
  for (let round = 0; round < 2; round++) {
    for (let step = 1; step <= 3; step++) {
      const index = (state.button + step) % 3;
      if (state.seats[index]!.folded) continue;
      const card = state.deck.pop();
      if (card) state.seats[index]!.hole.push(card);
    }
  }
  state.toAct = nextActor(state, bb);
  say(state, `Blinds ${SMALL}/${BIG}. ${state.seats[state.toAct]?.name ?? "You"} to act.`);
  if (state.toAct === -1 || roundDone(state)) finishAction(state);
  return state;
}

function post(state: HoldemState, index: number, amount: number) {
  const seat = state.seats[index]!;
  if (seat.folded) return;
  const pay = Math.min(seat.stack, amount);
  seat.stack -= pay;
  seat.bet += pay;
  seat.committed += pay;
  state.pot += pay;
  if (seat.stack === 0) seat.allIn = true;
}

function applyFold(state: HoldemState) {
  const seat = state.seats[state.toAct]!;
  seat.folded = true;
  seat.acted = true;
  say(state, `${seat.name} folds.`);
  finishAction(state);
}

function applyCheck(state: HoldemState) {
  const seat = state.seats[state.toAct]!;
  if (state.currentBet !== seat.bet) return;
  seat.acted = true;
  say(state, `${seat.name} checks.`);
  finishAction(state);
}

function applyCall(state: HoldemState) {
  const seat = state.seats[state.toAct]!;
  const toCall = state.currentBet - seat.bet;
  const pay = Math.min(seat.stack, Math.max(0, toCall));
  seat.stack -= pay;
  seat.bet += pay;
  seat.committed += pay;
  state.pot += pay;
  if (seat.stack === 0) seat.allIn = true;
  seat.acted = true;
  say(state, pay === 0 ? `${seat.name} checks.` : `${seat.name} calls ${pay}.`);
  finishAction(state);
}

function applyRaise(state: HoldemState, amount: number) {
  const seat = state.seats[state.toAct]!;
  const maxTo = seat.bet + seat.stack;
  const to = Math.min(Math.floor(amount), maxTo);
  if (to <= state.currentBet) {
    applyCall(state);
    return;
  }
  const minTo = state.currentBet === 0 ? BIG : state.currentBet + state.minRaise;
  if (to < minTo && to < maxTo) return;
  const pay = to - seat.bet;
  const increase = to - state.currentBet;
  seat.stack -= pay;
  seat.bet = to;
  seat.committed += pay;
  state.pot += pay;
  if (seat.stack === 0) seat.allIn = true;
  if (increase >= state.minRaise) state.minRaise = increase;
  state.currentBet = to;
  for (const other of state.seats) other.acted = false;
  seat.acted = true;
  say(state, `${seat.name} raises to ${to}.`);
  finishAction(state);
}

function chen(a: Card, b: Card): number {
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  let score = high === 14 ? 10 : high === 13 ? 8 : high === 12 ? 7 : high === 11 ? 6 : high / 2;
  if (a.rank === b.rank) score = Math.max(score * 2, 5);
  if (a.suit === b.suit) score += 2;
  const gap = high - low - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;
  return score;
}

function drawKind(hole: Card[], board: Card[]): "flush" | "straight" | "none" {
  if (board.length < 3 || board.length >= 5) return "none";
  const all = [...hole, ...board];
  const suits = new Map<string, number>();
  for (const card of all) suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  if ([...suits.entries()].some(([suit, count]) => count === 4 && hole.some((card) => card.suit === suit))) {
    return "flush";
  }
  const ranks = new Set<number>();
  for (const card of all) {
    ranks.add(card.rank);
    if (card.rank === 14) ranks.add(1);
  }
  for (let high = 5; high <= 14; high++) {
    const window = [high - 4, high - 3, high - 2, high - 1, high];
    if (window.filter((rank) => ranks.has(rank)).length !== 4) continue;
    const used = hole.some((card) => window.includes(card.rank) || (card.rank === 14 && window.includes(1)));
    if (used) return "straight";
  }
  return "none";
}

function chooseAi(state: HoldemState, index: number): HoldemAction {
  const seat = state.seats[index]!;
  const toCall = Math.max(0, state.currentBet - seat.bet);
  const bias = index === 1 ? 1 : -1;
  const maxTo = seat.bet + seat.stack;
  const minTo = Math.min(maxTo, state.currentBet === 0 ? BIG : state.currentBet + state.minRaise);
  const potRaiseTo =
    state.currentBet === 0
      ? Math.max(BIG, state.pot)
      : Math.min(maxTo, state.currentBet + state.pot + toCall);

  const bet = (to: number): HoldemAction => {
    if (seat.stack <= toCall) return { type: "call" };
    return { type: "raiseTo", amount: Math.min(maxTo, Math.max(minTo, to)) };
  };

  if (state.board.length === 0 && seat.hole.length === 2) {
    const score = chen(seat.hole[0]!, seat.hole[1]!) - bias;
    if (toCall === 0) {
      if (score >= 10) return bet(potRaiseTo);
      if (score >= 7) return bet(minTo);
      return { type: "check" };
    }
    const price = toCall / BIG;
    if (score >= 12) return bet(potRaiseTo);
    if (score >= 9 || (score >= 7 && price <= 3) || (score >= 6 && price <= 1)) return { type: "call" };
    return { type: "fold" };
  }

  const rank = bestHand([...seat.hole, ...state.board]);
  const draw = drawKind(seat.hole, state.board);
  if (toCall === 0) {
    if (rank.cat >= 4) return bet(potRaiseTo);
    if (rank.cat >= 2 || (rank.cat === 1 && (rank.kickers[0] ?? 0) >= 12)) return bet(Math.max(BIG, Math.floor(state.pot / 2)));
    if (draw === "flush" && Math.random() < 0.55) return bet(Math.max(BIG, Math.floor(state.pot / 2)));
    return { type: "check" };
  }
  const odds = toCall / (state.pot + toCall);
  if (rank.cat >= 6) return bet(potRaiseTo);
  if (rank.cat >= 4) return Math.random() < 0.45 ? bet(minTo) : { type: "call" };
  if (rank.cat >= 2) return { type: "call" };
  if (rank.cat === 1 && ((rank.kickers[0] ?? 0) >= 11 - bias || toCall <= state.pot * 0.33)) return { type: "call" };
  if (draw === "flush" && odds <= 0.36) return { type: "call" };
  if (draw === "straight" && odds <= 0.28) return { type: "call" };
  if (toCall <= BIG && rank.cat >= 1) return { type: "call" };
  return { type: "fold" };
}

export function createHoldem(humanStack: number): HoldemState {
  const state: HoldemState = {
    seats: [blankSeat("You", true, humanStack), blankSeat("Mina", false, 500), blankSeat("Rafa", false, 500)],
    button: 2,
    deck: [],
    board: [],
    pot: 0,
    street: "preflop",
    toAct: -1,
    currentBet: 0,
    minRaise: BIG,
    phase: "betting",
    status: "",
    log: [],
    revealed: false,
    handNames: [null, null, null],
    gains: [0, 0, 0],
  };
  return dealHand(state);
}

function draft(state: HoldemState): HoldemState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({ ...seat, hole: seat.hole.slice() })),
    deck: state.deck.slice(),
    board: state.board.slice(),
    log: state.log.slice(),
    handNames: state.handNames.slice(),
    gains: state.gains.slice(),
  };
}

export function reduceHoldem(state: HoldemState, action: HoldemAction): HoldemState {
  if (action.type === "rebuy") {
    const next = draft(state);
    next.seats[0]!.stack += action.amount;
    if (next.phase === "broke") return dealHand(next);
    say(next, `You rebuy ${action.amount}.`);
    return next;
  }
  if (action.type === "next") {
    if (state.phase !== "showdown" && state.phase !== "broke") return state;
    return dealHand(draft(state));
  }
  if (action.type === "runout") {
    if (state.phase !== "runout") return state;
    const next = draft(state);
    if (next.board.length >= 5) {
      award(next);
      return next;
    }
    dealStreet(next);
    if (next.board.length >= 5) {
      award(next);
      return next;
    }
    next.phase = "runout";
    next.toAct = -1;
    say(next, labelStreet(next.street) + ".");
    return next;
  }
  if (action.type === "ai") {
    if (state.phase !== "betting" || state.toAct < 0 || state.seats[state.toAct]?.human) return state;
    const next = draft(state);
    const decision = chooseAi(next, next.toAct);
    if (decision.type === "fold") applyFold(next);
    else if (decision.type === "check") applyCheck(next);
    else if (decision.type === "call") applyCall(next);
    else if (decision.type === "raiseTo") applyRaise(next, decision.amount);
    return next;
  }

  if (state.phase !== "betting" || state.toAct !== 0) return state;
  const seat = state.seats[0]!;
  if (seat.folded || seat.allIn) return state;
  const next = draft(state);
  if (action.type === "fold") applyFold(next);
  else if (action.type === "check") applyCheck(next);
  else if (action.type === "call") applyCall(next);
  else applyRaise(next, action.amount);
  return next;
}

export function actorOptions(state: HoldemState): ActorOptions | null {
  if (state.phase !== "betting" || state.toAct !== 0) return null;
  const seat = state.seats[0]!;
  if (seat.folded || seat.allIn) return null;
  const toCall = Math.max(0, state.currentBet - seat.bet);
  const canCheck = toCall === 0;
  const callAmount = Math.min(seat.stack, toCall);
  const raises: RaiseOption[] = [];
  const maxTo = seat.bet + seat.stack;
  if (seat.stack > toCall && maxTo > state.currentBet) {
    const minTo = state.currentBet === 0 ? Math.min(maxTo, BIG) : state.currentBet + state.minRaise;
    const seen = new Set<number>();
    const add = (label: string, raw: number, allowShort: boolean) => {
      let to = Math.min(maxTo, Math.floor(raw));
      if (!allowShort && to < minTo) to = Math.min(maxTo, minTo);
      if (to <= state.currentBet) return;
      if (!allowShort && to < minTo) return;
      if (seen.has(to)) return;
      seen.add(to);
      raises.push({ label, to });
    };
    if (maxTo >= (state.currentBet === 0 ? 1 : state.currentBet + 1)) {
      add(state.currentBet === 0 ? `Bet ${Math.min(maxTo, minTo) - seat.bet}` : `Raise to ${Math.min(maxTo, minTo)}`, minTo, false);
      const potTo = state.currentBet === 0 ? Math.max(BIG, state.pot) : state.currentBet + state.pot + toCall;
      add(state.currentBet === 0 ? `Pot ${Math.min(maxTo, Math.max(potTo, minTo)) - seat.bet}` : `Pot to ${Math.min(maxTo, Math.max(potTo, minTo))}`, potTo, false);
      add(`All in ${maxTo - seat.bet}`, maxTo, true);
    }
  }
  return { canCheck, callAmount, raises };
}

export function streetLabel(street: Street): string {
  return labelStreet(street);
}
