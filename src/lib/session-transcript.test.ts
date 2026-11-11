import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSessionTranscript,
  sessionTranscript,
  TAPE_JSON_MARK,
  transcriptStamp,
} from "./session-transcript.ts";
import type { SessionRow, TapeEvent, TapeView } from "./session-tape.types.ts";

const at = new Date(2026, 10, 9, 14, 32, 1, 123).getTime();
const later = at + 45_000;

const view: TapeView = {
  game: "holdem",
  title: "Flop. Your turn.",
  pot: 60,
  board: [
    { id: "as", rank: 14, suit: "s" },
    { id: "kh", rank: 13, suit: "h" },
    { id: "9d", rank: 9, suit: "d" },
  ],
  discard: [],
  seats: [
    {
      name: "You",
      stack: 480,
      bet: 20,
      acting: true,
      folded: false,
      tag: "",
      cards: [
        { id: "qc", rank: 12, suit: "c" },
        { id: "js", rank: 11, suit: "s", down: true },
      ],
      melds: [],
    },
  ],
};

const session: SessionRow = {
  id: "sit-1",
  game: "holdem",
  label: "Hold'em",
  startedAt: at,
  endedAt: later,
  buyIn: 500,
  cashOut: 480,
  events: 2,
};

const events: TapeEvent[] = [
  {
    id: "e1",
    seq: 1,
    at,
    actor: "You",
    kind: "enter",
    detail: "Sat down at Hold'em.",
    view,
  },
  {
    id: "e2",
    seq: 2,
    at: later,
    actor: "You",
    kind: "leave",
    detail: "Left the table with 480.",
    view: { ...view, title: "Left the table.", pot: 0 },
  },
];

describe("sessionTranscript", () => {
  it("writes headers, moves, and a JSON payload", () => {
    const text = sessionTranscript(session, events);
    assert.match(text, /^# Jade Felt session\r\n/);
    assert.match(text, /# Game: holdem/);
    assert.match(text, /# Table: Hold'em/);
    assert.match(text, new RegExp(`${transcriptStamp(at)}\\t0001\\tenter\\tYou\\tSat down at Hold'em.`));
    assert.match(text, new RegExp(`${TAPE_JSON_MARK}\\r\\n\\{`));
  });
});

describe("parseSessionTranscript", () => {
  it("round-trips a downloaded tape, including the felt", () => {
    const parsed = parseSessionTranscript(sessionTranscript(session, events));
    assert.equal(parsed.game, "holdem");
    assert.equal(parsed.label, "Hold'em");
    assert.equal(parsed.startedAt, at);
    assert.equal(parsed.endedAt, later);
    assert.equal(parsed.buyIn, 500);
    assert.equal(parsed.cashOut, 480);
    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.events[0]?.kind, "enter");
    assert.equal(parsed.events[0]?.detail, "Sat down at Hold'em.");
    assert.deepEqual(parsed.events[0]?.view, view);
    assert.equal(parsed.events[1]?.view.title, "Left the table.");
  });

  it("reads a legacy text file with no JSON payload", () => {
    const stamp = transcriptStamp(at);
    const text = [
      "# Jade Felt session",
      "# Table: Tong-its",
      `# Started: ${stamp}`,
      "# Ended: still open",
      "# Buy-in: 300",
      "# Cash-out: still at the table",
      "# Hands: 1",
      "# Moves: 2",
      "#",
      `${stamp}\t0001\tdeal\tDealer\tDealt Ace of spades.`,
      `${stamp}\t0002\texpose\tYou\tYou drop a meld.`,
    ].join("\n");
    const parsed = parseSessionTranscript(text);
    assert.equal(parsed.game, "tongits");
    assert.equal(parsed.label, "Tong-its");
    assert.equal(parsed.startedAt, at);
    assert.equal(parsed.endedAt, null);
    assert.equal(parsed.buyIn, 300);
    assert.equal(parsed.cashOut, null);
    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.events[0]?.kind, "deal");
    assert.equal(parsed.events[1]?.kind, "expose");
    assert.deepEqual(parsed.events[0]?.view, {
      game: "tongits",
      title: "",
      pot: 0,
      board: [],
      discard: [],
      seats: [],
    });
  });

  it("infers blackjack from the moves when the table name is unfamiliar", () => {
    const stamp = transcriptStamp(at);
    const text = [
      "# Jade Felt session",
      "# Table: The shoe",
      `# Started: ${stamp}`,
      `# Ended: ${stamp}`,
      "# Buy-in: 400",
      "# Cash-out: 380",
      "#",
      `${stamp}\t0001\thit\tYou\tYou hit. Drew a six.`,
    ].join("\r\n");
    const parsed = parseSessionTranscript(text);
    assert.equal(parsed.game, "blackjack");
  });

  it("rejects a file that is not a sitting", () => {
    assert.throws(() => parseSessionTranscript("hello"), /isn't a Jade Felt tape/);
  });
});
