-- Global AI: minimal game-log table for daily training
-- Paste this into Supabase SQL editor and run.

create table if not exists public.game_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  game_id text not null,
  winner text not null,
  total_moves int not null default 0,
  duration_seconds double precision not null default 0,
  trajectory jsonb,
  client_hint text
);

create index if not exists idx_game_logs_created_at on public.game_logs (created_at desc);

-- Optional: if you want to allow ONLY the Edge Function to insert,
-- keep RLS on and do NOT create a public insert policy.
alter table public.game_logs enable row level security;

-- Read-only policy (optional): allow anyone to read aggregated counts, not raw games.
-- For simplicity, we do NOT add a select policy here.
