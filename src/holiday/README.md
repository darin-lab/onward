# Holiday Party RSVP (temporary)

Party: Sunday, December 6, 5–8 PM, Fremont shop.

- Shows from 6:00 AM Pacific on Nov 18, 2026 and hides itself after Dec 6 (`HOLIDAY_START` / `HOLIDAY_END` in `types.ts`).
- Snowflake button next to Chat. It glows until the person answers Yes or No.
  - Darin and Arun: their own RSVP, everyone's answers by shop, total attending.
  - Managers: themselves plus their technicians, with printable invites.
  - Technicians: the invite, for themselves.
- The invite pops up once a day for anyone without a Yes or No.
- Managers on End of Day: the team list pops up once a day while anyone on it is undecided.
- Answers live in the `holiday_rsvp` table (migrations/0012_holiday_rsvp.sql), never in `board_state`.

## Removing it

1. Delete this folder (`src/holiday/`).
2. In `src/components/board/shell.tsx`, delete the `HolidayParty` import line and the `<HolidayParty />` line.
3. Add a migration with `drop table if exists holiday_rsvp;` (optional: the table is tiny).
