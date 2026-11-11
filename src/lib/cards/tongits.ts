import {
  freshDeck,
  shuffle,
  tongitsPoint,
  tongitsPoints,
  tongitsRank,
  type Card,
} from "@/lib/cards/model";

export const TONG_ANTE = 20;

export type TongPlayer = {
  name: string;
  human: boolean;
  stack: number;
  started: number;
  hand: Card[];
  melds: Card[][];
  locked: boolean;
  satOut: boolean;
};

export type TongNeed = "draw" | "play";

export type TongResult = {
  title: string;
  rows: { name: string; detail: string; delta: number }[];
};

export type TongState = {
  players: TongPlayer[];
  stock: Card[];
  discard: Card[];
  turn: number;
  dealer: number;
  phase: "act" | "answer" | "done" | "broke";
  need: TongNeed;
  pot: number;
  status: string;
  log: string[];
  fightCaller: number | null;
  pending: boolean[];
  result: TongResult | null;
};

export type TongAction =
  | { type: "draw" }
  | { type: "take"; handIds: string[] }
  | { type: "expose"; ids: string[] }
  | { type: "sapaw"; id: string; owner: number; meld: number }
  | { type: "discard"; id: string }
  | { type: "tongits" }
  | { type: "fight" }
  | { type: "answer"; fight: boolean }
  | { type: "bot" }
  | { type: "next" }
  | { type: "rebuy"; amount: number };

export function isValidMeld(cards: readonly Card[]): boolean {
  if (cards.length < 3 || cards.length > 13) return false;
  if (cards.every((card) => card.rank === cards[0]?.rank) && cards.length <= 4) return true;
  if (!cards.every((card) => card.suit === cards[0]?.suit)) return false;
  const ranks = cards.map(tongitsRank).sort((a, b) => a - b);
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1]! + 1) return false;
  }
  return true;
}

export type HandRead = {
  deadwood: number;
  groups: Card[][];
  loose: Card[];
};

export function readHand(cards: readonly Card[]): HandRead {
  const n = cards.length;
  const total = tongitsPoints(cards);
  const melds: { mask: number; pts: number }[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    let bits = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits++;
    if (bits < 3) continue;
    const subset: Card[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(cards[i]!);
    if (!isValidMeld(subset)) continue;
    melds.push({ mask, pts: tongitsPoints(subset) });
  }
  const memo = new Map<number, { cover: number; choice: number }>();
  const search = (used: number): { cover: number; choice: number } => {
    const cached = memo.get(used);
    if (cached) return cached;
    let best = { cover: 0, choice: -1 };
    for (let i = 0; i < melds.length; i++) {
      const meld = melds[i]!;
      if (used & meld.mask) continue;
      const rest = search(used | meld.mask);
      const cover = meld.pts + rest.cover;
      if (cover > best.cover) best = { cover, choice: i };
    }
    memo.set(used, best);
    return best;
  };
  const top = search(0);
  const groups: Card[][] = [];
  let used = 0;
  let guard = 0;
  while (guard++ < n) {
    const choice = memo.get(used)?.choice ?? -1;
    if (choice < 0) break;
    const meld = melds[choice]!;
    const group: Card[] = [];
    for (let i = 0; i < n; i++) if (meld.mask & (1 << i)) group.push(cards[i]!);
    groups.push(group);
    used |= meld.mask;
  }
  const loose = cards.filter((_, index) => (used & (1 << index)) === 0);
  return { deadwood: total - top.cover, groups, loose };
}

export function discardTakes(hand: readonly Card[], top: Card): Card[][] {
  const found: Card[][] = [];
  const n = hand.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset: Card[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(hand[i]!);
    if (subset.length < 2) continue;
    if (isValidMeld([...subset, top])) found.push(subset);
  }
  found.sort((a, b) => tongitsPoints(b) - tongitsPoints(a));
  const kept: Card[][] = [];
  for (const subset of found) {
    const ids = new Set(subset.map((card) => card.id));
    const dominated = kept.some((other) => other.every((card) => ids.has(card.id)));
    if (dominated) continue;
    kept.push(subset);
    if (kept.length === 3) break;
  }
  return kept;
}

function say(state: TongState, line: string) {
  state.status = line;
  state.log = [...state.log, line].slice(-8);
}

function clone(state: TongState): TongState {
  return {
    ...state,
    stock: state.stock.slice(),
    discard: state.discard.slice(),
    log: state.log.slice(),
    pending: state.pending.slice(),
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.slice(),
      melds: player.melds.map((meld) => meld.slice()),
    })),
    result: state.result
      ? { title: state.result.title, rows: state.result.rows.map((row) => ({ ...row })) }
      : null,
  };
}

function takeCards(hand: Card[], ids: readonly string[]): Card[] | null {
  const next = hand.slice();
  const picked: Card[] = [];
  for (const id of ids) {
    const index = next.findIndex((card) => card.id === id);
    if (index < 0) return null;
    picked.push(next[index]!);
    next.splice(index, 1);
  }
  hand.splice(0, hand.length, ...next);
  return picked;
}

function ante(state: TongState) {
  state.pot = 0;
  for (const player of state.players) {
    if (!player.human && player.stack < TONG_ANTE) player.stack = 240;
    const pay = Math.min(player.stack, TONG_ANTE);
    player.stack -= pay;
    state.pot += pay;
  }
}

function deal(state: TongState): TongState {
  if (state.players[0]!.stack <= 0) {
    state.phase = "broke";
    state.status = "You need chips before the next deal.";
    state.result = null;
    return state;
  }
  for (const player of state.players) {
    player.hand = [];
    player.melds = [];
    player.locked = false;
    player.satOut = false;
    player.started = player.stack;
  }
  const deck = shuffle(freshDeck());
  for (let round = 0; round < 12; round++) {
    for (const player of state.players) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }
  const extra = deck.pop();
  if (extra) state.players[state.dealer]!.hand.push(extra);
  state.stock = deck;
  state.discard = [];
  state.turn = state.dealer;
  state.need = "play";
  state.phase = "act";
  state.fightCaller = null;
  state.pending = [false, false, false];
  state.result = null;
  ante(state);
  say(state, `${state.players[state.dealer]!.name} deals. Drop a meld or discard to open.`);
  return state;
}

export function createTongits(stack: number): TongState {
  const state: TongState = {
    players: [
      { name: "You", human: true, stack, started: stack, hand: [], melds: [], locked: false, satOut: false },
      { name: "Liza", human: false, stack: 240, started: 240, hand: [], melds: [], locked: false, satOut: false },
      { name: "Nico", human: false, stack: 240, started: 240, hand: [], melds: [], locked: false, satOut: false },
    ],
    stock: [],
    discard: [],
    turn: 0,
    dealer: 0,
    phase: "act",
    need: "play",
    pot: 0,
    status: "",
    log: [],
    fightCaller: null,
    pending: [false, false, false],
    result: null,
  };
  return deal(state);
}

function pay(from: TongPlayer, to: TongPlayer, amount: number) {
  const chips = Math.min(from.stack, Math.max(0, amount));
  from.stack -= chips;
  to.stack += chips;
}

function resultRows(state: TongState, scores?: number[]): TongResult["rows"] {
  return state.players.map((player, index) => {
    let detail: string;
    if (player.satOut) detail = "Folded";
    else if (player.melds.length === 0) detail = "Burned · no open meld";
    else detail = `Count ${scores ? scores[index] : readHand(player.hand).deadwood}`;
    return { name: player.name, detail, delta: player.stack - player.started };
  });
}

function finish(state: TongState, title: string, winner: number | null, bonusEach: boolean) {
  if (winner != null) {
    const victor = state.players[winner]!;
    victor.stack += state.pot;
    state.pot = 0;
    if (bonusEach) {
      for (let index = 0; index < 3; index++) {
        if (index !== winner) pay(state.players[index]!, victor, TONG_ANTE);
      }
    }
    state.dealer = winner;
  } else {
    const sharers = state.players
      .map((_, index) => index)
      .filter((index) => !state.players[index]!.satOut && state.players[index]!.melds.length > 0);
    const pool = sharers.length > 0 ? sharers : [state.dealer];
    const share = Math.floor(state.pot / pool.length);
    let rem = state.pot - share * pool.length;
    for (const index of pool) {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      state.players[index]!.stack += share + extra;
    }
    state.pot = 0;
  }
  state.result = { title, rows: resultRows(state) };
  state.phase = "done";
  state.fightCaller = null;
  say(state, title);
}

function tongitsWin(state: TongState, index: number) {
  finish(state, `${state.players[index]!.name} calls Tong-its.`, index, true);
}

function showdown(state: TongState, title: string, caller: number | null) {
  const scores = state.players.map((player) =>
    player.satOut || player.melds.length === 0 ? Number.POSITIVE_INFINITY : readHand(player.hand).deadwood,
  );
  let pool = state.players.map((_, index) => index).filter((index) => scores[index] !== Number.POSITIVE_INFINITY);
  let penalty = false;
  if (caller != null && pool.includes(caller)) {
    const callerScore = scores[caller]!;
    const beaten = pool.some((index) => index !== caller && scores[index]! <= callerScore);
    if (beaten) {
      pool = pool.filter((index) => index !== caller);
      penalty = true;
    }
  }
  if (pool.length === 0) {
    finish(state, title, null, false);
    return;
  }
  const best = Math.min(...pool.map((index) => scores[index]!));
  const winners = pool.filter((index) => scores[index] === best);
  if (winners.length === 1) {
    const winner = winners[0]!;
    const victor = state.players[winner]!;
    victor.stack += state.pot;
    state.pot = 0;
    if (penalty && caller != null && caller !== winner) pay(state.players[caller]!, victor, TONG_ANTE);
    state.dealer = winner;
    state.result = {
      title: `${title} ${victor.name} has the lowest count.`,
      rows: resultRows(state),
    };
    state.phase = "done";
    state.fightCaller = null;
    say(state, state.result.title);
    return;
  }
  const share = Math.floor(state.pot / winners.length);
  let rem = state.pot - share * winners.length;
  for (const index of winners) {
    const extra = rem > 0 ? 1 : 0;
    rem -= extra;
    state.players[index]!.stack += share + extra;
  }
  state.pot = 0;
  state.result = {
    title: `${title} Split on ${best}.`,
    rows: resultRows(state),
  };
  state.phase = "done";
  say(state, state.result.title);
}

function advance(state: TongState) {
  state.players[state.turn]!.locked = false;
  state.turn = (state.turn + 1) % 3;
  state.need = "draw";
  const top = state.discard.at(-1);
  const canTake = top ? discardTakes(state.players[state.turn]!.hand, top).length > 0 : false;
  if (state.stock.length === 0 && !canTake) {
    showdown(state, "The stock is empty.", null);
    return;
  }
  say(state, `${state.players[state.turn]!.name} to draw.`);
}

function layGroups(player: TongPlayer, groups: Card[][]) {
  const ids = new Set(groups.flat().map((card) => card.id));
  player.hand = player.hand.filter((card) => !ids.has(card.id));
  for (const group of groups) player.melds.push(group.slice());
}

function botAct(state: TongState) {
  const index = state.turn;
  const player = state.players[index]!;
  if (state.need === "draw") {
    if (player.melds.length > 0 && !player.locked) {
      const dead = readHand(player.hand).deadwood;
      if (dead <= 4 || (dead <= 10 && state.stock.length <= 5)) {
        openFight(state, index);
        return;
      }
    }
    const top = state.discard.at(-1);
    const options = top ? discardTakes(player.hand, top) : [];
    if (top && options[0] && (tongitsPoint(top) >= 10 || player.melds.length === 0)) {
      const picked = options[0];
      const ids = new Set(picked.map((card) => card.id));
      player.hand = player.hand.filter((card) => !ids.has(card.id));
      state.discard.pop();
      player.melds.push([...picked, top]);
      say(state, `${player.name} takes ${top.id} and drops a meld.`);
    } else if (state.stock.length === 0) {
      showdown(state, "The stock is empty.", null);
      return;
    } else {
      const card = state.stock.pop();
      if (card) player.hand.push(card);
      say(state, `${player.name} draws.`);
    }
    state.need = "play";
  }
  if (state.phase !== "act" || state.turn !== index) return;
  let guard = 0;
  while (guard++ < 6) {
    const read = readHand(player.hand);
    if (read.groups.length === 0) break;
    if (read.deadwood === 0 || player.melds.length === 0) {
      layGroups(player, read.deadwood === 0 ? read.groups : [read.groups[0]!]);
      if (player.hand.length === 0) {
        tongitsWin(state, index);
        return;
      }
      if (read.deadwood !== 0) break;
      continue;
    }
    break;
  }
  if (state.phase !== "act") return;
  const loose = readHand(player.hand).loose.slice().sort((a, b) => tongitsPoint(b) - tongitsPoint(a));
  for (const card of loose) {
    let laid = false;
    for (let owner = 0; owner < 3 && !laid; owner++) {
      const melds = state.players[owner]!.melds;
      for (let meldIndex = 0; meldIndex < melds.length; meldIndex++) {
        if (!isValidMeld([...melds[meldIndex]!, card])) continue;
        player.hand = player.hand.filter((held) => held.id !== card.id);
        melds[meldIndex]!.push(card);
        if (owner !== index) state.players[owner]!.locked = true;
        laid = true;
        break;
      }
    }
  }
  if (player.hand.length === 0) {
    tongitsWin(state, index);
    return;
  }
  const after = readHand(player.hand);
  if (after.deadwood === 0 && after.groups.length > 0) {
    layGroups(player, after.groups);
    if (player.hand.length === 0) {
      tongitsWin(state, index);
      return;
    }
  }
  const dumpFrom = (after.loose.length ? after.loose : player.hand).slice().sort((a, b) => tongitsPoint(b) - tongitsPoint(a));
  const dump = dumpFrom[0];
  if (!dump) {
    tongitsWin(state, index);
    return;
  }
  player.hand = player.hand.filter((card) => card.id !== dump.id);
  state.discard.push(dump);
  say(state, `${player.name} discards ${dump.id}.`);
  if (player.hand.length === 0) {
    tongitsWin(state, index);
    return;
  }
  advance(state);
}

function openFight(state: TongState, caller: number) {
  state.fightCaller = caller;
  state.pending = state.players.map((player, index) => index !== caller && player.human && player.melds.length > 0);
  const answers = state.players.map((player, index) => {
    if (index === caller) return "fight" as const;
    if (player.melds.length === 0) return "burn" as const;
    if (!player.human) {
      const dead = readHand(player.hand).deadwood;
      return dead <= 15 ? "fight" : "fold";
    }
    return "pending" as const;
  });
  if (state.pending.some(Boolean)) {
    state.phase = "answer";
    say(state, `${state.players[caller]!.name} calls a fight. Fight or fold?`);
    state.pending = answers.map((answer) => answer === "pending");
    return;
  }
  resolveAnswers(state, answers);
}

function resolveAnswers(state: TongState, answers: ("fight" | "fold" | "burn" | "pending")[]) {
  for (let index = 0; index < 3; index++) {
    if (answers[index] === "fold") state.players[index]!.satOut = true;
  }
  const caller = state.fightCaller;
  showdown(state, "Fight.", caller);
}

export function reduceTongits(state: TongState, action: TongAction): TongState {
  if (action.type === "rebuy") {
    const next = clone(state);
    next.players[0]!.stack += action.amount;
    if (next.phase === "broke") return deal(next);
    return next;
  }
  if (action.type === "next") {
    if (state.phase !== "done" && state.phase !== "broke") return state;
    return deal(clone(state));
  }
  if (action.type === "bot") {
    if (state.phase !== "act" || state.players[state.turn]?.human) return state;
    const next = clone(state);
    botAct(next);
    return next;
  }
  if (action.type === "answer") {
    if (state.phase !== "answer" || !state.pending[0]) return state;
    const next = clone(state);
    const answers = next.players.map((player, index) => {
      if (index === next.fightCaller) return "fight" as const;
      if (player.melds.length === 0) return "burn" as const;
      if (player.human) return action.fight ? ("fight" as const) : ("fold" as const);
      return readHand(player.hand).deadwood <= 15 ? ("fight" as const) : ("fold" as const);
    });
    resolveAnswers(next, answers);
    return next;
  }
  if (state.phase !== "act" || state.turn !== 0) return state;
  const next = clone(state);
  const you = next.players[0]!;

  if (action.type === "draw") {
    if (next.need !== "draw") return state;
    if (next.stock.length === 0) {
      showdown(next, "The stock is empty.", null);
      return next;
    }
    const card = next.stock.pop();
    if (card) you.hand.push(card);
    next.need = "play";
    say(next, "You draw.");
    return next;
  }
  if (action.type === "take") {
    if (next.need !== "draw") return state;
    const top = next.discard.at(-1);
    if (!top) return state;
    const picked = takeCards(you.hand, action.handIds);
    if (!picked || !isValidMeld([...picked, top])) return state;
    next.discard.pop();
    you.melds.push([...picked, top]);
    next.need = "play";
    say(next, `You take the discard and drop a meld.`);
    if (you.hand.length === 0) tongitsWin(next, 0);
    return next;
  }
  if (action.type === "fight") {
    if (next.need !== "draw" || you.melds.length === 0 || you.locked) return state;
    openFight(next, 0);
    return next;
  }
  if (next.need !== "play") return state;
  if (action.type === "expose") {
    const picked = takeCards(you.hand, action.ids);
    if (!picked || !isValidMeld(picked)) return state;
    you.melds.push(picked);
    say(next, "You drop a meld.");
    if (you.hand.length === 0) tongitsWin(next, 0);
    return next;
  }
  if (action.type === "sapaw") {
    const card = you.hand.find((held) => held.id === action.id);
    const meld = next.players[action.owner]?.melds[action.meld];
    if (!card || !meld || !isValidMeld([...meld, card])) return state;
    you.hand = you.hand.filter((held) => held.id !== card.id);
    meld.push(card);
    if (action.owner !== 0) next.players[action.owner]!.locked = true;
    say(next, `You lay off on ${next.players[action.owner]!.name}.`);
    if (you.hand.length === 0) tongitsWin(next, 0);
    return next;
  }
  if (action.type === "tongits") {
    const read = readHand(you.hand);
    if (read.deadwood !== 0 || you.hand.length === 0) return state;
    layGroups(you, read.groups);
    if (you.hand.length === 0) tongitsWin(next, 0);
    return next;
  }
  if (action.type === "discard") {
    const card = you.hand.find((held) => held.id === action.id);
    if (!card || you.hand.length < 1) return state;
    you.hand = you.hand.filter((held) => held.id !== card.id);
    next.discard.push(card);
    if (you.hand.length === 0) {
      tongitsWin(next, 0);
      return next;
    }
    say(next, `You discard ${card.id}.`);
    advance(next);
    return next;
  }
  return state;
}

export function sapawTargets(state: TongState, card: Card): { owner: number; meld: number; name: string }[] {
  const targets: { owner: number; meld: number; name: string }[] = [];
  state.players.forEach((player, owner) => {
    player.melds.forEach((meld, meldIndex) => {
      if (isValidMeld([...meld, card])) {
        targets.push({ owner, meld: meldIndex, name: player.name });
      }
    });
  });
  return targets;
}
