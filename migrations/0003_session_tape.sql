create table if not exists sessions (
  id text primary key,
  game text not null references game_types (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  buy_in integer not null,
  cash_out integer,
  label text not null
);

create index if not exists sessions_started_at_idx on sessions (started_at);

create table if not exists session_events (
  session_id text not null references sessions (id) on delete cascade,
  seq integer not null,
  event_id text not null,
  at timestamptz not null,
  actor text not null,
  kind text not null,
  detail text not null,
  view_json text not null,
  primary key (session_id, seq),
  unique (session_id, event_id)
);

create index if not exists session_events_session_idx on session_events (session_id, seq);
