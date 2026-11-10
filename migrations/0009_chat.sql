-- Driven Chat. Every table is new; nothing here touches board_state, week_logs
-- or any other existing table. Each message is its own row.

-- Who may use chat at all. Starts as Darin only. The "everyone" switch in
-- chat_settings opens it to every signed-in person at launch.
create table if not exists chat_access (
  person_id text primary key,
  added_by text not null default 'system',
  added_at timestamptz not null default now()
);
insert into chat_access (person_id, added_by) values ('darin', 'migration')
  on conflict (person_id) do nothing;

create table if not exists chat_settings (
  key text primary key,
  value text not null
);
insert into chat_settings (key, value) values ('everyone', 'false')
  on conflict (key) do nothing;
insert into chat_settings (key, value) values ('push_preview', 'full')
  on conflict (key) do nothing;

-- A room is a channel, a group chat, or a direct message.
-- audience only matters for channels: 'everyone' or 'managers'.
create table if not exists chat_rooms (
  id text primary key,
  kind text not null check (kind in ('channel', 'group', 'dm')),
  name text,
  audience text not null default 'members' check (audience in ('everyone', 'managers', 'members')),
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

insert into chat_rooms (id, kind, name, audience) values
  ('all-driven', 'channel', 'All Driven', 'everyone'),
  ('all-managers', 'channel', 'All Managers', 'managers'),
  ('diagnostic-help', 'channel', 'Diagnostic Help', 'everyone'),
  ('client-wins', 'channel', 'Client Wins & Challenges!', 'everyone')
  on conflict (id) do nothing;

-- Membership doubles as the read marker (last_read_id) and the mute switch.
create table if not exists chat_members (
  room_id text not null references chat_rooms (id) on delete cascade,
  person_id text not null,
  last_read_id bigint not null default 0,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, person_id)
);
create index if not exists chat_members_person_idx on chat_members (person_id);

create table if not exists chat_messages (
  id bigserial primary key,
  room_id text not null references chat_rooms (id) on delete cascade,
  author_id text not null,
  body text not null default '',
  photo_id text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text
);
create index if not exists chat_messages_room_idx on chat_messages (room_id, id desc);
create index if not exists chat_messages_deleted_idx on chat_messages (deleted_at) where deleted_at is not null;

-- Photos are stored apart from the messages so the 30-day cleanup can blank
-- the picture and leave a "photo expired" note in its place.
create table if not exists chat_photos (
  id text primary key,
  data text not null default '',
  keep boolean not null default false,
  kept_by text,
  created_at timestamptz not null default now(),
  expired_at timestamptz
);

create table if not exists chat_presence (
  person_id text primary key,
  status text not null default 'online' check (status in ('online', 'away')),
  away_message text,
  last_seen timestamptz not null default now(),
  typing_room text,
  typing_at timestamptz
);

create table if not exists chat_profiles (
  person_id text primary key,
  avatar text,
  updated_at timestamptz not null default now()
);

-- One row per phone or computer that allowed notifications.
create table if not exists chat_push (
  endpoint text primary key,
  person_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_push_person_idx on chat_push (person_id);
