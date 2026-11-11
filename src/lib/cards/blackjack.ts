import { shoe, type Card } from "@/lib/cards/model";

export type BjHand = {
  cards: Card[];
  bet: number;
  done: boolean;
  doubled: boolean;
  fromSplit: boolean;
};

export type BjPhase = "bet" | "insurance" | "player" | "dealer" | "done" | "broke";

export type BjState = {
  stack: number;
  shoe: Card[];
  dealer: Card[];
  holeHidden: boolean;
  hands: BjHand[];
  active: number;
  phase: BjPhase;
  insurance: number;
  lastBet: number;
  status: string;
  dealerTotal: number | null;
};

export type BjAction =
  | { type: "deal"; bet: number }
  | { type: "insurance"; take: boolean }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double" }
  | { type: "split" }
  | { type: "dealer" }
  | { type: "rebuy"; amount: number };

export type HandTotal = { total: number; soft: boolean };

export function handTotal(cards: readonly Card[]): HandTotal {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 14) {
      aces += 1;
      total += 11;
    } else if (card.rank >= 10) total += 10;
    else total += card.rank;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

export function totalLabel(cards: readonly Card[]): string {
  const value = handTotal(cards);
  if (cards.length === 2 && value.total === 21) return "Blackjack";
  if (value.total > 21) return "Bust";
  return value.soft ? `Soft ${value.total}` : `Hard ${value.total}`;
}

function draw(state: BjState): Card {
  if (state.shoe.length < 15) state.shoe = shoe(4);
  const card = state.shoe.pop();
  if (!card) throw new Error("The shoe is empty.");
  return card;
}

export function createBlackjack(stack: number): BjState {
  return {
    stack,
    shoe: shoe(4),
    dealer: [],
    holeHidden: true,
    hands: [],
    active: 0,
    phase: stack > 0 ? "bet" : "broke",
    insurance: 0,
    lastBet: 20,
    status: stack > 0 ? "Place a bet. Dealer stands on every 17." : "You need chips to take a seat.",
    dealerTotal: null,
  };
}

function fresh(state: BjState): BjState {
  return {
    ...state,
    dealer: state.dealer.slice(),
    shoe: state.shoe.slice(),
    hands: state.hands.map((hand) => ({ ...hand, cards: hand.cards.slice() })),
  };
}

function isNatural(hand: BjHand): boolean {
  return !hand.fromSplit && !hand.doubled && hand.cards.length === 2 && handTotal(hand.cards).total === 21;
}

function dealerValue(cards: readonly Card[]): HandTotal {
  return handTotal(cards);
}

function settle(state: BjState) {
  const dealerCards = state.dealer;
  const dealer = dealerValue(dealerCards);
  const dealerBJ = dealerCards.length === 2 && dealer.total === 21;
  state.dealerTotal = dealer.total;
  state.holeHidden = false;
  let returned = 0;
  const notes: string[] = [];
  if (state.insurance > 0) {
    if (dealerBJ) {
      const win = state.insurance * 3;
      returned += win;
      notes.push(`Insurance pays ${win - state.insurance}`);
    } else notes.push("Insurance loses");
  }
  for (const hand of state.hands) {
    const value = handTotal(hand.cards);
    const natural = isNatural(hand);
    if (value.total > 21) {
      notes.push("Bust");
      continue;
    }
    if (dealerBJ && natural) {
      returned += hand.bet;
      notes.push("Push");
      continue;
    }
    if (dealerBJ) {
      notes.push("Dealer blackjack");
      continue;
    }
    if (natural) {
      const profit = Math.floor((hand.bet * 3) / 2);
      returned += hand.bet + profit;
      notes.push(`Blackjack pays ${profit}`);
      continue;
    }
    if (dealer.total > 21 || value.total > dealer.total) {
      returned += hand.bet * 2;
      notes.push(`Win ${hand.bet}`);
    } else if (value.total === dealer.total) {
      returned += hand.bet;
      notes.push("Push");
    } else notes.push(`Lose ${hand.bet}`);
  }
  state.stack += returned;
  state.phase = state.stack > 0 ? "done" : "broke";
  state.status = notes.join(" · ");
}

function peekAndMaybeFinish(state: BjState) {
  const up = state.dealer[0];
  const hole = state.dealer[1];
  if (!up || !hole) return;
  const dealerBJ = handTotal(state.dealer).total === 21;
  const tenUp = up.rank >= 10 && up.rank <= 13;
  if (tenUp && dealerBJ) {
    settle(state);
    return;
  }
  const playerBJ = state.hands.length === 1 && state.hands[0] && isNatural(state.hands[0]);
  if (playerBJ && !dealerBJ) {
    settle(state);
    return;
  }
  if (playerBJ && dealerBJ) {
    settle(state);
    return;
  }
  state.phase = "player";
  state.status = "Your hand.";
}

function playOn(state: BjState) {
  const hand = state.hands[state.active];
  if (!hand) {
    state.phase = "dealer";
    state.status = "Dealer plays.";
    return;
  }
  const value = handTotal(hand.cards);
  if (value.total >= 21 || hand.done) {
    hand.done = true;
    const next = state.hands.findIndex((candidate, index) => index > state.active && !candidate.done);
    if (next === -1) {
      state.phase = "dealer";
      state.status = "Dealer plays.";
      return;
    }
    state.active = next;
    state.status = `Hand ${next + 1}.`;
    return;
  }
  state.phase = "player";
}

export function reduceBlackjack(state: BjState, action: BjAction): BjState {
  if (action.type === "rebuy") {
    const next = fresh(state);
    next.stack += action.amount;
    if (next.phase === "broke") {
      next.phase = "bet";
      next.status = "Place a bet.";
    }
    return next;
  }
  if (action.type === "deal") {
    if (state.phase !== "bet" && state.phase !== "done") return state;
    const bet = Math.floor(action.bet);
    if (bet < 1 || bet > state.stack) return state;
    const next = fresh(state);
    next.stack -= bet;
    next.lastBet = bet;
    next.insurance = 0;
    next.dealerTotal = null;
    next.dealer = [draw(next), draw(next)];
    next.holeHidden = true;
    next.hands = [{ cards: [draw(next), draw(next)], bet, done: false, doubled: false, fromSplit: false }];
    next.active = 0;
    const up = next.dealer[0]!;
    if (up.rank === 14 && next.stack > 0) {
      next.phase = "insurance";
      next.status = "Dealer shows an ace. Insurance?";
      return next;
    }
    peekAndMaybeFinish(next);
    return next;
  }
  if (action.type === "insurance") {
    if (state.phase !== "insurance") return state;
    const next = fresh(state);
    if (action.take) {
      const cost = Math.floor((next.hands[0]?.bet ?? 0) / 2);
      if (cost > 0 && next.stack >= cost) {
        next.stack -= cost;
        next.insurance = cost;
      }
    }
    peekAndMaybeFinish(next);
    return next;
  }
  if (state.phase !== "player") return state;
  const next = fresh(state);
  const hand = next.hands[next.active];
  if (!hand || hand.done) return state;

  if (action.type === "hit") {
    hand.cards.push(draw(next));
    if (handTotal(hand.cards).total >= 21) hand.done = true;
    playOn(next);
    return next;
  }
  if (action.type === "stand") {
    hand.done = true;
    playOn(next);
    return next;
  }
  if (action.type === "double") {
    if (hand.cards.length !== 2 || hand.fromSplit || next.stack < hand.bet) return state;
    next.stack -= hand.bet;
    hand.bet += hand.bet;
    hand.doubled = true;
    hand.cards.push(draw(next));
    hand.done = true;
    next.status = "Doubled.";
    playOn(next);
    return next;
  }
  if (action.type === "split") {
    if (next.hands.length !== 1 || hand.cards.length !== 2 || next.stack < hand.bet) return state;
    const [a, b] = hand.cards;
    if (!a || !b || a.rank !== b.rank) return state;
    const aces = a.rank === 14;
    next.stack -= hand.bet;
    const left: BjHand = { cards: [a, draw(next)], bet: hand.bet, done: aces, doubled: false, fromSplit: true };
    const right: BjHand = { cards: [b, draw(next)], bet: hand.bet, done: aces, doubled: false, fromSplit: true };
    next.hands = [left, right];
    next.active = 0;
    if (aces) {
      next.phase = "dealer";
      next.status = "Split aces each get one card.";
      return next;
    }
    if (handTotal(left.cards).total === 21) left.done = true;
    playOn(next);
    next.status = "Split. Playing the first hand.";
    return next;
  }
  if (action.type === "dealer") {
    return state;
  }
  return state;
}

export function dealerStep(state: BjState): BjState {
  if (state.phase !== "dealer") return state;
  const next = fresh(state);
  next.holeHidden = false;
  const value = handTotal(next.dealer);
  if (value.total < 17) {
    next.dealer.push(draw(next));
    const now = handTotal(next.dealer);
    next.dealerTotal = now.total;
    next.status = now.total > 21 ? "Dealer busts." : `Dealer has ${now.soft ? "soft " : ""}${now.total}.`;
    if (now.total >= 17) settle(next);
    return next;
  }
  settle(next);
  return next;
}

export function canDouble(state: BjState): boolean {
  const hand = state.hands[state.active];
  if (!hand || state.phase !== "player" || hand.done) return false;
  return hand.cards.length === 2 && state.stack >= hand.bet;
}

export function canSplit(state: BjState): boolean {
  const hand = state.hands[state.active];
  if (!hand || state.phase !== "player" || state.hands.length !== 1) return false;
  return hand.cards.length === 2 && hand.cards[0]?.rank === hand.cards[1]?.rank && state.stack >= hand.bet;
}
