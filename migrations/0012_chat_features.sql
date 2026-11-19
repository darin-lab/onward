-- @mentions, reactions, and "changed" tracking for reactions.
alter table chat_messages add column if not exists mentions text not null default '';
alter table chat_messages add column if not exists touched_at timestamptz;

create table if not exists chat_reactions (
  message_id bigint not null references chat_messages (id) on delete cascade,
  person_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, person_id, emoji)
);
