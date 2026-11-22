create extension if not exists "pgcrypto";

create table if not exists kos_target (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_key      text not null unique,
  class         text,
  level         int,
  status        text not null default 'active',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists kos_incident (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null references kos_target(id) on delete cascade,
  kind        text not null,
  note        text,
  zone        text,
  occurred_at timestamptz not null,
  reported_by text not null,
  source      text not null default 'addon',
  client_id   text not null unique
);

create index if not exists kos_incident_target_time
  on kos_incident (target_id, occurred_at desc);

create index if not exists kos_incident_kind
  on kos_incident (kind);
