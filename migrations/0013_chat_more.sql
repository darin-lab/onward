-- Replies, pins, edits, GIFs, file attachments, and Do Not Disturb hours.
alter table chat_messages add column if not exists reply_to bigint;
alter table chat_messages add column if not exists pinned_at timestamptz;
alter table chat_messages add column if not exists pinned_by text;
alter table chat_messages add column if not exists edited_at timestamptz;
alter table chat_messages add column if not exists gif_url text;
alter table chat_messages add column if not exists file_id text;
create index if not exists chat_messages_pinned_idx on chat_messages (room_id, pinned_at) where pinned_at is not null;

create table if not exists chat_files (
  id text primary key,
  name text not null,
  mime text not null default 'application/octet-stream',
  size integer not null default 0,
  data text not null default '',
  created_at timestamptz not null default now(),
  expired_at timestamptz
);

-- Quiet hours, in Pacific hours 0-23. Null means off. Mentions still notify.
alter table chat_profiles add column if not exists dnd_start smallint;
alter table chat_profiles add column if not exists dnd_end smallint;
