create table if not exists staff_pins (
  person_id text primary key,
  pin_hash text not null
);

create table if not exists app_secret (
  id text primary key,
  secret text not null
);
