create table if not exists board_state (
  id text primary key,
  data text not null,
  updated_at timestamptz not null default now()
);
