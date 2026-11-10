create table if not exists public.pt_training_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer check (capacity between 1 and 1000),
  instructions text not null default '' check (length(instructions) <= 2000),
  meeting_url text not null default '',
  is_open boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.pt_training_sessions add column if not exists meeting_url text not null default '';
create table if not exists public.pt_training_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pt_training_sessions(id),
  name text not null check (length(name) between 2 and 40),
  phone text not null check (phone ~ '^01[016789][0-9]{7,8}$'),
  ready_confirmed boolean not null check (ready_confirmed),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(session_id, phone)
);
alter table public.pt_training_sessions enable row level security;
alter table public.pt_training_bookings enable row level security;
revoke all on public.pt_training_sessions, public.pt_training_bookings from anon, authenticated;
grant all on public.pt_training_sessions, public.pt_training_bookings to service_role;
create index if not exists pt_training_sessions_start_idx on public.pt_training_sessions(starts_at);

create or replace function public.pt_training_book(p_session uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.pt_training_sessions; booking_id uuid; booked integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('pt-training:' || p_phone, 0));
  select * into s from public.pt_training_sessions where id = p_session for update;
  if not found or not s.is_open or s.starts_at <= now() then raise exception 'SESSION_CLOSED'; end if;
  if exists(select 1 from public.pt_training_bookings where session_id=p_session and phone=p_phone) then
    raise exception 'ALREADY_BOOKED';
  end if;
  select count(*) into booked from public.pt_training_bookings where session_id=p_session;
  if s.capacity is not null and booked >= s.capacity then raise exception 'SESSION_FULL'; end if;
  if (select count(*) from public.pt_training_bookings where phone=p_phone and created_at > now()-interval '1 day') >= 5 then
    raise exception 'TOO_MANY_BOOKINGS';
  end if;
  insert into public.pt_training_bookings(session_id,name,phone,ready_confirmed)
    values(p_session,trim(p_name),p_phone,true) returning id into booking_id;
  return booking_id;
end $$;
revoke all on function public.pt_training_book(uuid,text,text) from public, anon, authenticated;
grant execute on function public.pt_training_book(uuid,text,text) to service_role;

create or replace function public.pt_training_protect_booked_session()
returns trigger language plpgsql set search_path = public as $$
declare booked integer;
begin
  select count(*) into booked from public.pt_training_bookings where session_id=old.id;
  if booked > 0 and (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at) then
    raise exception 'BOOKED_TIME_LOCKED';
  end if;
  if new.capacity is not null and new.capacity < booked then raise exception 'CAPACITY_TOO_SMALL'; end if;
  return new;
end $$;
drop trigger if exists pt_training_protect_booked_session on public.pt_training_sessions;
create trigger pt_training_protect_booked_session before update on public.pt_training_sessions
for each row execute function public.pt_training_protect_booked_session();
notify pgrst, 'reload schema';
