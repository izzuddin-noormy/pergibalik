create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,          -- E.164, e.g. +60123456789
  name text not null,
  pin_hash text not null,              -- scrypt$salt$hash (never the PIN itself)
  failed_attempts int not null default 0,
  locked_until timestamptz,
  disabled boolean not null default false,  -- set true to block a driver
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table public.drivers enable row level security;
alter table public.vans add column if not exists driver_id uuid references public.drivers(id) on delete set null;
