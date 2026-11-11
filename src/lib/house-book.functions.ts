import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";

const GAMES = ["holdem", "blackjack", "tongits", "chinese"] as const;
type GameId = (typeof GAMES)[number];

type BookedHand = {
  id: string;
  game: GameId;
  at: number;
  summary: string;
  seats: { name: string; delta: number; note: string }[];
};

const handInput = z.object({
  game: z.enum(GAMES),
  summary: z.string().trim().min(1).max(500),
  seats: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        delta: z.number().int().min(-1_000_000).max(1_000_000),
        note: z.string().max(200),
      }),
    )
    .min(1)
    .max(8),
});

const GAME_SET = new Set<string>(GAMES);

type HandRow = {
  id: string;
  game: string;
  summary: string;
  at: number | string;
  seat_name: string;
  delta: number | string;
  note: string;
};

export const listHands = createServerFn({ method: "GET" }).handler(async (): Promise<BookedHand[]> => {
  const sql = await getSql();
  const rows = await sql<HandRow>`
    select
      h.id,
      h.game,
      h.summary,
      extract(epoch from h.played_at) * 1000 as at,
      s.seat_name,
      s.delta,
      s.note
    from hands h
    join hand_seats s on s.hand_id = h.id
    order by h.played_at asc, s.seat_index asc
  `;
  const hands = new Map<string, BookedHand>();
  for (const row of rows) {
    if (!GAME_SET.has(row.game)) continue;
    let hand = hands.get(row.id);
    if (!hand) {
      hand = {
        id: row.id,
        game: row.game as GameId,
        at: Number(row.at),
        summary: row.summary,
        seats: [],
      };
      hands.set(row.id, hand);
    }
    hand.seats.push({
      name: row.seat_name,
      delta: Number(row.delta),
      note: row.note,
    });
  }
  return [...hands.values()];
});

export const saveHand = createServerFn({ method: "POST" })
  .validator((data: unknown) => handInput.parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await sql`insert into hands (id, game, summary) values (${id}, ${data.game}, ${data.summary})`;
    for (let index = 0; index < data.seats.length; index += 1) {
      const seat = data.seats[index]!;
      await sql`
        insert into players (name, role) values (${seat.name}, 'Guest')
        on conflict (name) do nothing
      `;
      await sql`
        insert into hand_seats (hand_id, seat_index, seat_name, delta, note)
        values (${id}, ${index}, ${seat.name}, ${seat.delta}, ${seat.note})
      `;
    }
    await sql`
      delete from hands
      where id in (
        select id from hands
        order by played_at desc
        offset 200
      )
    `;
    return { id };
  });
