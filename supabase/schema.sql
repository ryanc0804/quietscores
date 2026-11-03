-- Quiet Scores: per-user favorite teams.
-- Run once in Supabase → SQL Editor.

create table if not exists public.favorites (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  team_key     text        not null,          -- "<sport>:<teamId>", e.g. "nfl:2"
  sport        text        not null,
  team_id      text        not null,
  name         text,
  logo         text,
  abbreviation text,
  created_at   timestamptz not null default now(),
  primary key (user_id, team_key)
);

alter table public.favorites enable row level security;

-- Each user can only see and change their own favorites.
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own" on public.favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);
