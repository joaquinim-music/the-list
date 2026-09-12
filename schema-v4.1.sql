-- THE LIST v4.1
-- Public player identity uses username. Supabase Auth may still use a private email
-- behind the scenes; the email is not shown on profiles, leaderboards, completions, or proofs.

create unique index if not exists players_username_lower_idx
on public.players (lower(username))
where username is not null;
