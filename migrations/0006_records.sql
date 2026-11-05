-- Call reflections, cash pickups and End of Day reports each get their own
-- table, so none of them ride along in the single board_state row.
create table if not exists call_reflections (
  id text primary key,
  manager_id text not null,
  data text not null,
  audio text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  mailed_at timestamptz
);

create table if not exists cash_transfers (
  id text primary key,
  shop_id text not null,
  data text not null,
  requested_at text not null,
  updated_at timestamptz not null default now()
);

create table if not exists day_reports (
  shop_id text not null,
  day text not null,
  data text not null,
  updated_at timestamptz not null default now(),
  mailed_at timestamptz,
  primary key (shop_id, day)
);
