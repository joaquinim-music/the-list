-- THE LIST v5: ranking stabilization + player leaderboard + analytics

-- More stable Elo: higher K for new levels, lower K as ratings mature.
create or replace function public.submit_comparison(p_level_a bigint,p_level_b bigint,p_winner bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.levels;b public.levels;ea double precision;eb double precision;new_a double precision;new_b double precision;ka double precision;kb double precision;
begin
 if p_level_a=p_level_b then raise exception 'A level cannot be compared with itself'; end if;
 if p_winner<>p_level_a and p_winner<>p_level_b then raise exception 'Winner must be one of the two compared levels'; end if;
 select * into a from public.levels where id=p_level_a for update; select * into b from public.levels where id=p_level_b for update;
 if a.id is null or b.id is null then raise exception 'One or both levels do not exist'; end if;
 ea:=1/(1+power(10,(b.rating-a.rating)/400)); eb:=1-ea;
 ka:=case when a.comparisons<10 then 40 when a.comparisons<30 then 28 when a.comparisons<100 then 20 else 14 end;
 kb:=case when b.comparisons<10 then 40 when b.comparisons<30 then 28 when b.comparisons<100 then 20 else 14 end;
 if p_winner=p_level_a then new_a:=a.rating+ka*(1-ea);new_b:=b.rating+kb*(0-eb); else new_a:=a.rating+ka*(0-ea);new_b:=b.rating+kb*(1-eb); end if;
 update public.levels set rating=new_a,comparisons=comparisons+1 where id=a.id; update public.levels set rating=new_b,comparisons=comparisons+1 where id=b.id;
 insert into public.comparisons(level_a,level_b,winner) values(p_level_a,p_level_b,p_winner);
 insert into public.rating_history(level_id,rating,comparisons) values(a.id,new_a,a.comparisons+1),(b.id,new_b,b.comparisons+1);
 return jsonb_build_object('level_a',p_level_a,'level_b',p_level_b,'winner',p_winner,'rating_a',new_a,'rating_b',new_b);
end;$$;
grant execute on function public.submit_comparison(bigint,bigint,bigint) to anon,authenticated;

-- Rich player leaderboard. Difficulty score rewards higher-rated verified completions.
drop view if exists public.player_leaderboard_v5;
create view public.player_leaderboard_v5 as
with base as (
 select p.id player_id,p.username,count(c.id)::integer levels_beaten,
 coalesce(sum(greatest(0,l.rating-1500)),0)::double precision difficulty_score,
 coalesce(max(l.rating),0)::double precision hardest_rating,
 min(c.created_at) first_completion_at,max(c.created_at) latest_completion_at
 from public.players p left join public.completions c on c.player_id=p.id and c.status='approved' left join public.levels l on l.id=c.level_id
 where p.username is not null group by p.id,p.username
), hardest as (
 select b.*,l.id hardest_level_id,l.name hardest_name,rank() over(order by b.hardest_rating desc) leaderboard_hardest_rank
 from base b left join lateral (select id,name,rating from public.levels where rating=b.hardest_rating order by id limit 1) l on true
) select h.*,rank() over(order by h.difficulty_score desc,h.levels_beaten desc,h.hardest_rating desc,h.player_id) leaderboard_rank
from hardest h;
grant select on public.player_leaderboard_v5 to anon,authenticated;

drop view if exists public.player_stats_v5;
create view public.player_stats_v5 as
select * from public.player_leaderboard_v5;
grant select on public.player_stats_v5 to anon,authenticated;

-- Backfill history with one snapshot per level so graphs have a starting point.
insert into public.rating_history(level_id,rating,comparisons)
select l.id,l.rating,l.comparisons from public.levels l
where not exists(select 1 from public.rating_history h where h.level_id=l.id);

-- Minimum popularity requirement for newly submitted levels.
alter table public.levels
add column if not exists downloads integer;

-- Only allow newly submitted levels to be inserted when their reported
-- GDBrowser download count is at least 1,000. The frontend checks GDBrowser
-- first and stores that count with the level.
drop policy if exists "Public can add levels" on public.levels;
create policy "Public can add levels"
on public.levels
for insert
to anon, authenticated
with check (
  rating = 1500
  and comparisons = 0
  and baseline_rank is null
  and downloads >= 1000
);
