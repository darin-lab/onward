create table if not exists receipts (
  id text primary key,
  total numeric not null,
  note text not null,
  image_data text,
  image_type text,
  image_name text,
  submitter_id text not null,
  submitter_email text not null,
  submitter_name text not null,
  day text not null,
  created_at timestamptz not null default now(),
  mailed_at timestamptz
);
