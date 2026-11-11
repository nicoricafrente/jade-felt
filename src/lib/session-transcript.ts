import { TAPE_KINDS, type SessionRow, type TapeEvent, type TapeView } from "./session-tape.types.ts";

type GameId = SessionRow["game"];

const GAMES = ["holdem", "blackjack", "tongits", "chinese"] as const;
const GAME_SET = new Set<string>(GAMES);
const KIND_SET = new Set<string>(TAPE_KINDS);
const CAP = 800;
const TITLE = "# Jade Felt session";
export const TAPE_JSON_MARK = "# --- jade-felt-tape ---";

const TABLE_GAMES: Record<string, GameId> = {
  "hold'em": "holdem",
  holdem: "holdem",
  blackjack: "blackjack",
  "tong-its": "tongits",
  tongits: "tongits",
  "chinese poker": "chinese",
  chinese: "chinese",
};

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** Local timestamp that still sorts oldest-first as plain text. */
export function transcriptStamp(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function transcriptName(session: SessionRow): string {
  const date = new Date(session.startedAt);
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `jade-felt-session-${day}.txt`;
}

function handsIn(events: TapeEvent[]): number {
  return events.filter((event) => event.kind === "deal" || event.kind === "next").length;
}

export type TranscriptEvent = {
  at: number;
  seq: number;
  kind: TapeEvent["kind"];
  actor: string;
  detail: string;
  view: TapeView;
};

export type ParsedTape = {
  game: GameId;
  label: string;
  startedAt: number;
  endedAt: number | null;
  buyIn: number;
  cashOut: number | null;
  events: TranscriptEvent[];
};

function blankView(game: GameId): TapeView {
  return { game, title: "", pot: 0, board: [], discard: [], seats: [] };
}

function isGame(value: unknown): value is GameId {
  return typeof value === "string" && GAME_SET.has(value);
}

function clampTime(value: number): number {
  return Math.min(9_000_000_000_000, Math.max(0, Math.trunc(value)));
}

function clampMoney(value: number): number {
  return Math.min(1_000_000, Math.max(0, Math.trunc(value)));
}

function inferGame(label: string, kinds: string[]): GameId {
  const named = TABLE_GAMES[label.trim().toLowerCase()];
  if (named) return named;
  const set = new Set(kinds);
  if (set.has("hit") || set.has("stand") || set.has("double") || set.has("split") || set.has("insurance")) return "blackjack";
  if (set.has("sapaw") || set.has("fight") || set.has("tongits") || set.has("expose")) return "tongits";
  if (set.has("submit") || set.has("reveal")) return "chinese";
  return "holdem";
}

function parseStamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value.trim());
  if (!match) return null;
  const at = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number(match[7]),
  ).getTime();
  return Number.isFinite(at) ? at : null;
}

function headerValue(line: string, key: string): string | null {
  const prefix = `# ${key}: `;
  if (!line.startsWith(prefix)) return null;
  return line.slice(prefix.length).trim();
}

function coerceView(value: unknown, game: GameId): TapeView {
  if (!value || typeof value !== "object") return blankView(game);
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.seats) || !Array.isArray(row.board) || !Array.isArray(row.discard)) return blankView(game);
  const view = value as TapeView;
  return { ...view, game: isGame(view.game) ? view.game : game };
}

function parseJsonEvent(item: unknown, game: GameId): TranscriptEvent | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (typeof row.at !== "number" || !Number.isFinite(row.at)) return null;
  if (typeof row.kind !== "string" || !KIND_SET.has(row.kind)) return null;
  if (typeof row.actor !== "string" || !row.actor.trim()) return null;
  if (typeof row.detail !== "string" || !row.detail.trim()) return null;
  const seq = typeof row.seq === "number" && Number.isFinite(row.seq) ? Math.trunc(row.seq) : 0;
  return {
    at: clampTime(row.at),
    seq: seq > 0 ? seq : 0,
    kind: row.kind as TapeEvent["kind"],
    actor: row.actor.trim().slice(0, 40),
    detail: row.detail.trim().slice(0, 500),
    view: coerceView(row.view, game),
  };
}

function parseTapeJson(text: string): ParsedTape | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (!isGame(row.game)) return null;
  if (typeof row.label !== "string" || !row.label.trim()) return null;
  if (typeof row.startedAt !== "number" || !Number.isFinite(row.startedAt)) return null;
  if (typeof row.buyIn !== "number" || !Number.isFinite(row.buyIn)) return null;
  if (row.endedAt != null && (typeof row.endedAt !== "number" || !Number.isFinite(row.endedAt))) return null;
  if (row.cashOut != null && (typeof row.cashOut !== "number" || !Number.isFinite(row.cashOut))) return null;
  if (!Array.isArray(row.events)) return null;
  const game = row.game;
  const events: TranscriptEvent[] = [];
  for (const item of row.events) {
    const event = parseJsonEvent(item, game);
    if (event) events.push(event);
    if (events.length >= CAP) break;
  }
  return {
    game,
    label: row.label.trim().slice(0, 80),
    startedAt: clampTime(row.startedAt),
    endedAt: row.endedAt == null ? null : clampTime(row.endedAt),
    buyIn: clampMoney(row.buyIn),
    cashOut: row.cashOut == null ? null : clampMoney(row.cashOut),
    events,
  };
}

function parseTapeText(text: string): ParsedTape | null {
  const lines = text.split("\n").map((line) => line.replace(/\s+$/, ""));
  if (!lines.some((line) => line === TITLE)) return null;
  let label = "";
  let gameHeader: GameId | null = null;
  let startedAt: number | null = null;
  let endedAt: number | null = null;
  let endedOpen = false;
  let buyIn: number | null = null;
  let cashOut: number | null = null;
  let cashOpen = false;
  const events: TranscriptEvent[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (line === TITLE || line === "#") continue;
    const table = headerValue(line, "Table");
    if (table != null) {
      label = table.slice(0, 80);
      continue;
    }
    const game = headerValue(line, "Game");
    if (game != null) {
      if (isGame(game)) gameHeader = game;
      continue;
    }
    const started = headerValue(line, "Started");
    if (started != null) {
      startedAt = parseStamp(started);
      continue;
    }
    const ended = headerValue(line, "Ended");
    if (ended != null) {
      if (ended === "still open") endedOpen = true;
      else endedAt = parseStamp(ended);
      continue;
    }
    const buy = headerValue(line, "Buy-in");
    if (buy != null) {
      const value = Number(buy);
      buyIn = Number.isFinite(value) ? clampMoney(value) : null;
      continue;
    }
    const cash = headerValue(line, "Cash-out");
    if (cash != null) {
      if (cash === "still at the table") cashOpen = true;
      else {
        const value = Number(cash);
        cashOut = Number.isFinite(value) ? clampMoney(value) : null;
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const at = parseStamp(parts[0] ?? "");
    const seq = Number(parts[1]);
    const kind = parts[2] ?? "";
    const actor = (parts[3] ?? "").trim().slice(0, 40);
    const detail = parts.slice(4).join("\t").trim().slice(0, 500);
    if (at == null || !KIND_SET.has(kind) || !actor || !detail) continue;
    events.push({
      at,
      seq: Number.isFinite(seq) && seq > 0 ? Math.trunc(seq) : events.length + 1,
      kind: kind as TapeEvent["kind"],
      actor,
      detail,
      view: blankView("holdem"),
    });
    if (events.length >= CAP) break;
  }
  if (!label || startedAt == null || buyIn == null) return null;
  const game = gameHeader ?? inferGame(label, events.map((event) => event.kind));
  return {
    game,
    label,
    startedAt,
    endedAt: endedOpen ? null : endedAt,
    buyIn,
    cashOut: cashOpen ? null : cashOut,
    events: events.map((event) => ({ ...event, view: { ...event.view, game } })),
  };
}

/** Read a downloaded sitting back into the tape. */
export function parseSessionTranscript(text: string): ParsedTape {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const fromJson = parseTapeJson(trimmed);
    if (fromJson) return fromJson;
  }
  const markAt = raw.indexOf(TAPE_JSON_MARK);
  if (markAt >= 0) {
    const fromJson = parseTapeJson(raw.slice(markAt + TAPE_JSON_MARK.length).trim());
    if (fromJson) return fromJson;
  }
  const fromText = parseTapeText(markAt >= 0 ? raw.slice(0, markAt) : raw);
  if (fromText) return fromText;
  throw new Error("That file isn't a Jade Felt tape.");
}

/** One sitting, every hand, oldest move first. */
export function sessionTranscript(session: SessionRow, events: TapeEvent[]): string {
  const sorted = events.slice().sort((left, right) => left.at - right.at || left.seq - right.seq);
  const started = sorted.length ? Math.min(session.startedAt, sorted[0]!.at) : session.startedAt;
  const lastMove = sorted.at(-1)?.at ?? null;
  const ended =
    session.endedAt == null ? "still open" : transcriptStamp(Math.max(session.endedAt, lastMove ?? session.endedAt));
  const cash = session.cashOut == null ? "still at the table" : String(session.cashOut);
  const payload: ParsedTape = {
    game: session.game,
    label: session.label,
    startedAt: started,
    endedAt: session.endedAt,
    buyIn: session.buyIn,
    cashOut: session.cashOut,
    events: sorted.map((event) => ({
      at: event.at,
      seq: event.seq,
      kind: event.kind,
      actor: event.actor,
      detail: event.detail,
      view: event.view,
    })),
  };
  const lines = [
    TITLE,
    `# Table: ${session.label}`,
    `# Game: ${session.game}`,
    `# Started: ${transcriptStamp(started)}`,
    `# Ended: ${ended}`,
    `# Buy-in: ${session.buyIn}`,
    `# Cash-out: ${cash}`,
    `# Hands: ${handsIn(sorted)}`,
    `# Moves: ${sorted.length}`,
    "# One file for the whole sitting. Hands stay in timestamp order.",
    "#",
    ...sorted.map((event) => {
      const seq = pad(event.seq, 4);
      return `${transcriptStamp(event.at)}\t${seq}\t${event.kind}\t${event.actor}\t${event.detail}`;
    }),
    TAPE_JSON_MARK,
    JSON.stringify(payload),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadSessionTranscript(session: SessionRow, events: TapeEvent[]) {
  const text = sessionTranscript(session, events);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = transcriptName(session);
  link.click();
  URL.revokeObjectURL(url);
}
