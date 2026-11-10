-- Last answer from the shop dashboard for a range, so pages can show it
-- right away while a fresh copy loads.
create table if not exists dashboard_cache (
  id text primary key,
  data text not null,
  updated_at timestamptz not null default now()
);
