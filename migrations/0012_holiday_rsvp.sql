-- Holiday Party RSVP (Dec 6, 2026). Temporary: one table of its own, nothing
-- in board_state. To remove after the party, delete src/holiday/, the two
-- HolidayParty lines in src/components/board/shell.tsx, and add a migration
-- with: drop table if exists holiday_rsvp;
create table if not exists holiday_rsvp (
  person_id text primary key,
  answer text check (answer in ('yes', 'maybe', 'no')),
  attending integer not null default 1,
  answered_by text,
  updated_at timestamptz not null default now(),
  -- Pacific day the invite pop-up was last shown, so it shows once a day.
  prompt_day date,
  -- Pacific day a manager last saw the team pop-up at End of Day.
  team_prompt_day date
);
