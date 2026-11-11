import { better, rankFive, rankFront, rankKey, type HandRank } from "@/lib/cards/eval";
import { combinations, freshDeck, shuffle, type Card } from "@/lib/cards/model";

export const CHINESE_UNIT = 20;

export type Arrangement = {
  front: Card[];
  middle: Card[];
  back: Card[];
};

export type ChinesePlayer = {
  name: string;
  human: boolean;
  stack: number;
  started: number;
  cards: Card[];
  set: Arrangement | null;
  foul: boolean;
};

export type ChineseResult = {
  title: string;
  rows: { name: string; detail: string; delta: number }[];
  lines: string[];
};

export type ChineseState = {
  players: ChinesePlayer[];
  phase: "arrange" | "reveal" | "broke";
  status: string;
  result: ChineseResult | null;
};

export type ChineseAction =
  | { type: "submit"; arrangement: Arrangement }
  | { type: "next" }
  | { type: "rebuy"; amount: number };

function royaltyOf(front: HandRank, middle: HandRank, back: HandRank): { front: number; middle: number; back: number } {
  return {
    front: front.cat === 3 ? 3 : 0,
    middle: middle.cat === 8 ? 5 : middle.cat === 7 ? 4 : middle.cat === 6 ? 2 : 0,
    back: back.cat === 8 ? 5 : back.cat === 7 ? 4 : 0,
  };
}

export function royaltyUnits(hand: Arrangement): number {
  const front = rankFront(hand.front);
  const middle = rankFive(hand.middle);
  const back = rankFive(hand.back);
  const roy = royaltyOf(front, middle, back);
  return roy.front + roy.middle + roy.back;
}

export function royaltyLabel(hand: Arrangement): string {
  const front = rankFront(hand.front);
  const middle = rankFive(hand.middle);
  const back = rankFive(hand.back);
  const roy = royaltyOf(front, middle, back);
  const bits: string[] = [];
  if (roy.front) bits.push(`front +${roy.front}`);
  if (roy.middle) bits.push(`middle +${roy.middle}`);
  if (roy.back) bits.push(`back +${roy.back}`);
  return bits.join(", ");
}

export function arrangementIssue(hand: Arrangement): string | null {
  if (hand.front.length !== 3 || hand.middle.length !== 5 || hand.back.length !== 5) {
    return "Place all thirteen cards.";
  }
  const back = rankFive(hand.back);
  const middle = rankFive(hand.middle);
  const front = rankFront(hand.front);
  if (better(back, middle) <= 0) return "Back must rank strictly above the middle.";
  if (better(middle, front) <= 0) return "Middle must rank strictly above the front.";
  return null;
}

export function describeArrangement(hand: Arrangement): { front: string; middle: string; back: string } {
  return {
    front: hand.front.length === 3 ? rankFront(hand.front).name : "Three cards",
    middle: hand.middle.length === 5 ? rankFive(hand.middle).name : "Five cards",
    back: hand.back.length === 5 ? rankFive(hand.back).name : "Five cards",
  };
}

function scoreKey(front: HandRank, middle: HandRank, back: HandRank): [number, number, number, number] {
  const roy = royaltyOf(front, middle, back);
  return [roy.front + roy.middle + roy.back, rankKey(back), rankKey(middle), rankKey(front)];
}

function betterKey(a: [number, number, number, number], b: [number, number, number, number]): number {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

function fallback(cards: Card[]): Arrangement {
  const ordered = cards.slice().sort((a, b) => b.rank - a.rank);
  return { back: ordered.slice(0, 5), middle: ordered.slice(5, 10), front: ordered.slice(10) };
}

export function arrangeOptimal(cards: readonly Card[]): { arrangement: Arrangement; legal: boolean } {
  const list = cards.slice();
  const indexes = list.map((_, index) => index);
  let best: Arrangement | null = null;
  let bestKey: [number, number, number, number] = [-1, -1, -1, -1];
  for (const backIx of combinations(indexes, 5)) {
    const backCards = backIx.map((index) => list[index]!);
    const backRank = rankFive(backCards);
    const used = new Set(backIx);
    const rest = indexes.filter((index) => !used.has(index));
    for (const midIx of combinations(rest, 5)) {
      const midCards = midIx.map((index) => list[index]!);
      const midRank = rankFive(midCards);
      if (better(backRank, midRank) <= 0) continue;
      const midUsed = new Set(midIx);
      const frontCards = rest.filter((index) => !midUsed.has(index)).map((index) => list[index]!);
      const frontRank = rankFront(frontCards);
      if (better(midRank, frontRank) <= 0) continue;
      const key = scoreKey(frontRank, midRank, backRank);
      if (betterKey(key, bestKey) > 0) {
        bestKey = key;
        best = { front: frontCards, middle: midCards, back: backCards };
      }
    }
  }
  if (!best) return { arrangement: fallback(list), legal: false };
  return { arrangement: best, legal: true };
}

type Scored = { foul: true } | { foul: false; hand: Arrangement; front: HandRank; middle: HandRank; back: HandRank };

function scoreOf(hand: Arrangement | null, foul: boolean): Scored {
  if (!hand || foul || arrangementIssue(hand)) return { foul: true };
  return { foul: false, hand, front: rankFront(hand.front), middle: rankFive(hand.middle), back: rankFive(hand.back) };
}

function pairUnits(a: Scored, b: Scored): number {
  if (a.foul && b.foul) return 0;
  if (a.foul && !b.foul) {
    const roy = royaltyOf(b.front, b.middle, b.back);
    return -(4 + roy.front + roy.middle + roy.back);
  }
  if (!a.foul && b.foul) {
    const roy = royaltyOf(a.front, a.middle, a.back);
    return 4 + roy.front + roy.middle + roy.back;
  }
  if (a.foul || b.foul) return 0;
  let rowsA = 0;
  let rowsB = 0;
  const back = better(a.back, b.back);
  const middle = better(a.middle, b.middle);
  const front = better(a.front, b.front);
  if (back > 0) rowsA++;
  else if (back < 0) rowsB++;
  if (middle > 0) rowsA++;
  else if (middle < 0) rowsB++;
  if (front > 0) rowsA++;
  else if (front < 0) rowsB++;
  let units = rowsA - rowsB;
  if (rowsA === 3) units += 1;
  if (rowsB === 3) units += -1;
  const royA = royaltyOf(a.front, a.middle, a.back);
  const royB = royaltyOf(b.front, b.middle, b.back);
  units += royA.front + royA.middle + royA.back;
  units -= royB.front + royB.middle + royB.back;
  return units;
}

function pay(from: ChinesePlayer, to: ChinesePlayer, chips: number) {
  const amount = Math.min(from.stack, Math.max(0, chips));
  from.stack -= amount;
  to.stack += amount;
}

function settle(state: ChineseState) {
  const scored = state.players.map((player) => scoreOf(player.set, player.foul));
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const lines: string[] = [];
  for (const [left, right] of pairs) {
    const units = pairUnits(scored[left]!, scored[right]!);
    const chips = Math.abs(units) * CHINESE_UNIT;
    if (units > 0) pay(state.players[right]!, state.players[left]!, chips);
    else if (units < 0) pay(state.players[left]!, state.players[right]!, chips);
    const verb = units === 0 ? "chop" : units > 0 ? "wins" : "loses";
    lines.push(
      `${state.players[left]!.name} ${verb} ${units === 0 ? "with" : Math.abs(units) + " from"} ${state.players[right]!.name}`,
    );
  }
  state.result = {
    title: "Hands shown.",
    lines,
    rows: state.players.map((player) => ({
      name: player.name,
      detail: player.foul || !player.set ? "Foul" : describeArrangement(player.set).back,
      delta: player.stack - player.started,
    })),
  };
  state.phase = "reveal";
  state.status = "Compare back, middle, then front.";
}

function deal(state: ChineseState): ChineseState {
  for (const player of state.players) {
    if (!player.human && player.stack < 100) player.stack = 400;
  }
  if (state.players[0]!.stack <= 0) {
    state.phase = "broke";
    state.status = "You need chips to take a hand.";
    state.result = null;
    return state;
  }
  const deck = shuffle(freshDeck());
  for (const player of state.players) {
    player.started = player.stack;
    player.cards = [];
    player.set = null;
    player.foul = false;
    for (let i = 0; i < 13; i++) {
      const card = deck.pop();
      if (card) player.cards.push(card);
    }
  }
  state.phase = "arrange";
  state.result = null;
  state.status = "Set back, middle, and front. Back must beat middle, middle must beat front.";
  return state;
}

export function createChinese(stack: number): ChineseState {
  const state: ChineseState = {
    players: [
      { name: "You", human: true, stack, started: stack, cards: [], set: null, foul: false },
      { name: "Wen", human: false, stack: 400, started: 400, cards: [], set: null, foul: false },
      { name: "Paolo", human: false, stack: 400, started: 400, cards: [], set: null, foul: false },
    ],
    phase: "arrange",
    status: "",
    result: null,
  };
  return deal(state);
}

function sameIds(cards: readonly Card[], arrangement: Arrangement): boolean {
  const ids = cards.map((card) => card.id).sort();
  const used = [...arrangement.front, ...arrangement.middle, ...arrangement.back].map((card) => card.id).sort();
  return ids.length === used.length && ids.every((id, index) => id === used[index]);
}

export function reduceChinese(state: ChineseState, action: ChineseAction): ChineseState {
  if (action.type === "rebuy") {
    const next: ChineseState = {
      ...state,
      players: state.players.map((player) => ({ ...player, cards: player.cards.slice() })),
    };
    next.players[0]!.stack += action.amount;
    if (next.phase === "broke") return deal(next);
    return next;
  }
  if (action.type === "next") {
    if (state.phase !== "reveal" && state.phase !== "broke") return state;
    return deal({
      ...state,
      players: state.players.map((player) => ({ ...player, cards: player.cards.slice() })),
    });
  }
  if (action.type !== "submit" || state.phase !== "arrange") return state;
  const you = state.players[0]!;
  if (!sameIds(you.cards, action.arrangement)) return state;
  const next: ChineseState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      cards: player.cards.slice(),
      set: player.set
        ? { front: player.set.front.slice(), middle: player.set.middle.slice(), back: player.set.back.slice() }
        : null,
    })),
  };
  const issue = arrangementIssue(action.arrangement);
  next.players[0]!.set = {
    front: action.arrangement.front.slice(),
    middle: action.arrangement.middle.slice(),
    back: action.arrangement.back.slice(),
  };
  next.players[0]!.foul = issue != null;
  for (let index = 1; index < 3; index++) {
    const bot = next.players[index]!;
    const arranged = arrangeOptimal(bot.cards);
    bot.set = arranged.arrangement;
    bot.foul = !arranged.legal;
  }
  settle(next);
  return next;
}
