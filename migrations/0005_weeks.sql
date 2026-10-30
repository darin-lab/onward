create table if not exists week_logs (
  tech_id text not null,
  week_start text not null,
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (tech_id, week_start)
);
