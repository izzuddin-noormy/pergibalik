-- Every position a signed-in driver sends (only while they are Online).
create table if not exists public.van_pings (
  id bigserial primary key,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  van_id text not null,
  lat double precision not null,
  lng double precision not null,
  speed double precision,      -- m/s
  heading double precision,
  accuracy double precision,   -- m
  recorded_at timestamptz not null default now()
);
create index if not exists van_pings_van_time on public.van_pings (van_id, recorded_at desc);
create index if not exists van_pings_driver_time on public.van_pings (driver_id, recorded_at);
alter table public.van_pings enable row level security;

-- Cached street names for timeline stops (rounded to ~100 m).
create table if not exists public.place_cache (
  key text primary key,          -- "lat3,lng3"
  label text not null,
  created_at timestamptz not null default now()
);
alter table public.place_cache enable row level security;
