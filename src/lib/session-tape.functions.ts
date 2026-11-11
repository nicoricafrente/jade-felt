import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { TAPE_KINDS, type SessionRow, type TapeEvent, type TapeView } from "@/lib/session-tape.types";

const GAMES = ["holdem", "blackjack", "tongits", "chinese"] as const;
const GAME_SET = new Set<string>(GAMES);

const card = z.object({
  id: z.string().min(1).max(40),
  rank: z.number().int().min(0).max(14),
  suit: z.enum(["s", "h", "d", "c"]),
  down: z.boolean().optional(),
});

const viewInput = z.object({
  game: z.enum(GAMES),
  title: z.string().max(300),
  pot: z.number().int().min(0).max(1_000_000),
  board: z.array(card).max(10),
  discard: z.array(card).max(16),
  seats: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        stack: z.number().int().min(0).max(1_000_000),
        bet: z.number().int().min(0).max(1_000_000),
        acting: z.boolean(),
        folded: z.boolean(),
        tag: z.string().max(80),
        cards: z.array(card).max(20),
        melds: z.array(z.array(card).max(14)).max(8),
      }),
    )
    .max(6),
});

const eventInput = z.object({
  id: z.string().min(6).max(40),
  at: z.number().int().min(0).max(9_000_000_000_000),
  actor: z.string().trim().min(1).max(40),
  kind: z.enum(TAPE_KINDS),
  detail: z.string().trim().min(1).max(500),
  view: viewInput,
});

const eventsInput = z.array(eventInput).max(40);

const openInput = z.object({
  game: z.enum(GAMES),
  buyIn: z.number().int().min(0).max(1_000_000),
  label: z.string().trim().min(1).max(80),
});

const appendInput = z.object({
  sessionId: z.string().min(4).max(40),
  events: eventsInput,
});

const closeInput = appendInput.extend({
  cashOut: z.number().int().min(0).max(1_000_000),
});

const readInput = z.object({
  sessionId: z.string().min(4).max(40),
});

const CAP = 800;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function nextSeq(sessionId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ seq: number | string }>`
    select coalesce(max(seq), 0) as seq from session_events where session_id = ${sessionId}
  `;
  return Number(rows[0]?.seq ?? 0);
}

async function writeEvents(sessionId: string, events: z.infer<typeof eventInput>[]): Promise<void> {
  if (events.length === 0) return;
  const sql = await getSql();
  let seq = await nextSeq(sessionId);
  for (const event of events) {
    if (seq >= CAP) return;
    seq += 1;
    await sql`
      insert into session_events (session_id, seq, event_id, at, actor, kind, detail, view_json)
      values (
        ${sessionId},
        ${seq},
        ${event.id},
        to_timestamp(${event.at / 1000}),
        ${event.actor},
        ${event.kind},
        ${event.detail},
        ${JSON.stringify(event.view)}
      )
      on conflict (session_id, event_id) do nothing
    `;
  }
}

async function trimSessions(): Promise<void> {
  const sql = await getSql();
  await sql`
    delete from sessions
    where id in (
      select id from sessions
      order by started_at desc
      offset 40
    )
  `;
}

export const openSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => openInput.parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const id = newId();
    await sql`
      insert into sessions (id, game, buy_in, label)
      values (${id}, ${data.game}, ${data.buyIn}, ${data.label})
    `;
    await trimSessions();
    return { id };
  });

export const appendSessionEvents = createServerFn({ method: "POST" })
  .validator((data: unknown) => appendInput.parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const found = await sql<{ id: string }>`select id from sessions where id = ${data.sessionId}`;
    if (!found[0]) return { ok: false as const };
    await writeEvents(data.sessionId, data.events);
    return { ok: true as const };
  });

export const closeSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => closeInput.parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const found = await sql<{ id: string }>`select id from sessions where id = ${data.sessionId}`;
    if (!found[0]) return { ok: false as const };
    await writeEvents(data.sessionId, data.events);
    await sql`
      update sessions
      set ended_at = now(), cash_out = ${data.cashOut}
      where id = ${data.sessionId}
    `;
    return { ok: true as const };
  });

type ListRow = {
  id: string;
  game: string;
  label: string;
  started_at: number | string;
  ended_at: number | string | null;
  buy_in: number | string;
  cash_out: number | string | null;
  events: number | string;
};

export const listSessions = createServerFn({ method: "GET" }).handler(async (): Promise<SessionRow[]> => {
  const sql = await getSql();
  const rows = await sql<ListRow>`
    select
      s.id,
      s.game,
      s.label,
      extract(epoch from s.started_at) * 1000 as started_at,
      extract(epoch from s.ended_at) * 1000 as ended_at,
      s.buy_in,
      s.cash_out,
      (select count(*) from session_events e where e.session_id = s.id) as events
    from sessions s
    order by s.started_at desc
  `;
  return rows
    .filter((row) => GAME_SET.has(row.game))
    .map((row) => ({
      id: row.id,
      game: row.game as SessionRow["game"],
      label: row.label,
      startedAt: Number(row.started_at),
      endedAt: row.ended_at == null ? null : Number(row.ended_at),
      buyIn: Number(row.buy_in),
      cashOut: row.cash_out == null ? null : Number(row.cash_out),
      events: Number(row.events),
    }));
});

type EventRow = {
  seq: number | string;
  event_id: string;
  at: number | string;
  actor: string;
  kind: string;
  detail: string;
  view_json: string;
};

const KIND_SET = new Set<string>(TAPE_KINDS);

const importEvent = eventInput.omit({ id: true }).extend({
  seq: z.number().int().min(0).max(CAP).optional(),
});

const importInput = z.object({
  game: z.enum(GAMES),
  label: z.string().trim().min(1).max(80),
  startedAt: z.number().int().min(0).max(9_000_000_000_000),
  endedAt: z.number().int().min(0).max(9_000_000_000_000).nullable(),
  buyIn: z.number().int().min(0).max(1_000_000),
  cashOut: z.number().int().min(0).max(1_000_000).nullable(),
  events: z.array(importEvent).max(CAP),
});

export const importSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => importInput.parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const id = newId();
    const endedAt = data.endedAt == null ? null : data.endedAt / 1000;
    await sql.query(
      `insert into sessions (id, game, started_at, ended_at, buy_in, cash_out, label)
       values ($1, $2, to_timestamp($3), to_timestamp($4), $5, $6, $7)`,
      [id, data.game, data.startedAt / 1000, endedAt, data.buyIn, data.cashOut, data.label],
    );
    await writeEvents(
      id,
      data.events.map((event) => ({
        id: newId(),
        at: event.at,
        actor: event.actor,
        kind: event.kind,
        detail: event.detail,
        view: event.view,
      })),
    );
    await trimSessions();
    return { id };
  });

export const readSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => readInput.parse(data))
  .handler(async ({ data }): Promise<TapeEvent[]> => {
    const sql = await getSql();
    const rows = await sql<EventRow>`
      select seq, event_id, extract(epoch from at) * 1000 as at, actor, kind, detail, view_json
      from session_events
      where session_id = ${data.sessionId}
      order by seq asc
    `;
    const events: TapeEvent[] = [];
    for (const row of rows) {
      if (!KIND_SET.has(row.kind)) continue;
      let view: TapeView;
      try {
        view = viewInput.parse(JSON.parse(row.view_json));
      } catch {
        continue;
      }
      events.push({
        id: row.event_id,
        seq: Number(row.seq),
        at: Number(row.at),
        actor: row.actor,
        kind: row.kind as TapeEvent["kind"],
        detail: row.detail,
        view,
      });
    }
    return events;
  });
