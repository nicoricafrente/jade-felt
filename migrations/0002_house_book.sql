create table if not exists game_types (
  id text primary key,
  name text not null,
  mark text not null,
  line text not null,
  buy_in integer not null
);

create table if not exists players (
  name text primary key,
  role text not null
);

create table if not exists hands (
  id text primary key,
  game text not null references game_types (id),
  played_at timestamptz not null default now(),
  summary text not null
);

create index if not exists hands_played_at_idx on hands (played_at);

create table if not exists hand_seats (
  hand_id text not null references hands (id) on delete cascade,
  seat_index integer not null,
  seat_name text not null references players (name),
  delta integer not null,
  note text not null,
  primary key (hand_id, seat_index),
  unique (hand_id, seat_name)
);

insert into game_types (id, name, mark, line, buy_in) values
  ('holdem', 'Hold''em', '♠', 'No-limit. Three seats. Blinds 10 and 20.', 500),
  ('blackjack', 'Blackjack', '♥', 'Four decks. Dealer stands on every 17.', 400),
  ('tongits', 'Tong-its', '♣', 'Melds, lay-offs, and a fight for the low count.', 300),
  ('chinese', 'Chinese poker', '♦', 'Thirteen cards across back, middle, and front.', 400)
on conflict (id) do nothing;

insert into players (name, role) values
  ('You', 'The seat'),
  ('Mina', 'Hold''em regular'),
  ('Rafa', 'Hold''em regular'),
  ('Dealer', 'House shoe'),
  ('Liza', 'Tong-its regular'),
  ('Nico', 'Tong-its regular'),
  ('Wen', 'Chinese poker regular'),
  ('Paolo', 'Chinese poker regular')
on conflict (name) do nothing;
