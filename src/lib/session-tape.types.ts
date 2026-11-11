import type { GameId } from "@/lib/wallet";

export const TAPE_KINDS = [
  "enter",
  "leave",
  "deposit",
  "withdraw",
  "turn",
  "check",
  "fold",
  "call",
  "raise",
  "draw",
  "discard",
  "deal",
  "hit",
  "stand",
  "double",
  "split",
  "insurance",
  "expose",
  "sapaw",
  "fight",
  "answer",
  "tongits",
  "submit",
  "showdown",
  "next",
  "reveal",
] as const;

export type TapeKind = (typeof TAPE_KINDS)[number];

export type TapeCard = {
  id: string;
  rank: number;
  suit: "s" | "h" | "d" | "c";
  down?: boolean;
};

export type TapeSeat = {
  name: string;
  stack: number;
  bet: number;
  acting: boolean;
  folded: boolean;
  tag: string;
  cards: TapeCard[];
  melds: TapeCard[][];
};

export type TapeView = {
  game: GameId;
  title: string;
  pot: number;
  board: TapeCard[];
  discard: TapeCard[];
  seats: TapeSeat[];
};

export type TapeMove = {
  kind: TapeKind;
  actor: string;
  detail: string;
};

export type TapeEvent = TapeMove & {
  id: string;
  seq: number;
  at: number;
  view: TapeView;
};

export type SessionRow = {
  id: string;
  game: GameId;
  label: string;
  startedAt: number;
  endedAt: number | null;
  buyIn: number;
  cashOut: number | null;
  events: number;
};
