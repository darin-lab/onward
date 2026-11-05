-- Feedback from managers and technicians for Darin and Arun.
create table if not exists feedback (
  id text primary key,
  about text not null,
  author_id text not null,
  week_start text not null,
  data text not null,
  created_at timestamptz not null default now(),
  mailed_at timestamptz
);
