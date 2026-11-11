-- Status is set at the first login of each day (Pacific) and cleaned up by a 7pm sweep.
alter table chat_presence add column if not exists signed_in_day date;
