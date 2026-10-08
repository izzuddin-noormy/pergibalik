create table if not exists public.vans (
  id text primary key,
  driver_name text,
  route text,
  lat double precision,
  lng double precision,
  heading double precision,
  speed double precision,
  accuracy double precision,
  online boolean not null default false,
  updated_at timestamptz not null default now()
);
-- Only the server (service role key on Vercel) reads/writes. No public policies.
alter table public.vans enable row level security;
