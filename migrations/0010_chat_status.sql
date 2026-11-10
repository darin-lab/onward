-- Status is now chosen by the person: online, offline, under a car, with a client.
-- 'away' stays allowed so older rows remain valid.
alter table chat_presence drop constraint if exists chat_presence_status_check;
alter table chat_presence add constraint chat_presence_status_check
  check (status in ('online', 'away', 'offline', 'under_car', 'with_client'));
