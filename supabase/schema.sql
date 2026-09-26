-- Quizline schema. Paste into Supabase SQL editor and run once.
create extension if not exists pgcrypto;

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  artist text not null,
  wait_minutes int not null,
  tags text[] not null default '{}',
  status text not null default 'lobby',      -- lobby | live | ended
  phase text not null default 'lobby',       -- lobby | question | reveal | ended
  current_index int not null default -1,
  question_count int not null default 0,
  phase_ends_at timestamptz,
  source text not null default 'grok',       -- grok | fallback
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  idx int not null,
  prompt text not null,
  options jsonb not null,
  answer_index int not null,
  difficulty int not null default 2,
  tags text[] not null default '{}',
  unique (quiz_id, idx)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null default '',
  price_gbp numeric(8,2) not null,
  emoji text not null default '🛍️',
  tags text[] not null default '{}'
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  name text not null,
  score int not null default 0,
  correct int not null default 0,
  profile jsonb not null default '{}',
  bundle jsonb,
  created_at timestamptz not null default now()
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  question_idx int not null,
  choice int not null,
  correct boolean not null,
  ms int not null,
  created_at timestamptz not null default now(),
  unique (player_id, question_idx)
);

create table if not exists agent_log (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  agent text not null,                       -- quiz | merch | fan
  summary text not null,
  created_at timestamptz not null default now()
);

-- Reads: anon can read everything except questions (answers stay server-side).
alter table quizzes enable row level security;
alter table questions enable row level security;
alter table items enable row level security;
alter table players enable row level security;
alter table answers enable row level security;
alter table agent_log enable row level security;
drop policy if exists "read" on quizzes;   create policy "read" on quizzes   for select using (true);
drop policy if exists "read" on items;     create policy "read" on items     for select using (true);
drop policy if exists "read" on players;   create policy "read" on players   for select using (true);
drop policy if exists "read" on answers;   create policy "read" on answers   for select using (true);
drop policy if exists "read" on agent_log; create policy "read" on agent_log for select using (true);

-- Realtime
do $$ begin
  alter publication supabase_realtime add table quizzes, players, answers, agent_log;
exception when duplicate_object then null; end $$;
