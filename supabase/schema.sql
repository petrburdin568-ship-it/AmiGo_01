create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  state_id text not null unique,
  amigo_id text not null unique,
  name text not null,
  age integer not null check (age between 0 and 120),
  bio text not null default '',
  avatar_url text not null default '',
  friendship_goal text not null default 'casual-talk',
  communication_formats text[] not null default '{}',
  personality_tags text[] not null default '{}',
  icebreaker text not null default '',
  availability text not null default 'late-evenings',
  title_text text not null default 'Гражданин',
  title_category text not null default 'system',
  title_icon text not null default 'CIV',
  title_tone text not null default 'silver',
  title_locked boolean not null default true,
  granted_by uuid references auth.users (id) on delete set null,
  titles jsonb not null default '[]'::jsonb,
  active_title_id text,
  capability_flags text[] not null default '{}',
  coin_balance numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists state_id text;
alter table public.profiles add column if not exists amigo_id text;
alter table public.profiles add column if not exists title_text text not null default 'Гражданин';
alter table public.profiles add column if not exists title_category text not null default 'system';
alter table public.profiles add column if not exists title_icon text not null default 'CIV';
alter table public.profiles add column if not exists title_tone text not null default 'silver';
alter table public.profiles add column if not exists title_locked boolean not null default true;
alter table public.profiles add column if not exists granted_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists titles jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists active_title_id text;
alter table public.profiles add column if not exists capability_flags text[] not null default '{}';
alter table public.profiles add column if not exists coin_balance numeric not null default 0;

create or replace function public.generate_state_id()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(((floor(random() * 1000000000))::bigint)::text, 9, '0');
    exit when candidate <> '123545663'
      and not exists (
        select 1
        from public.profiles
        where state_id = candidate
      );
  end loop;

  return candidate;
end;
$$;

create or replace function public.generate_amigo_id(seed_name text default '')
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
begin
  base := upper(substr(regexp_replace(coalesce(seed_name, ''), '[^A-Za-z0-9]+', '', 'g'), 1, 8));
  if base is null or base = '' then
    base := 'USER';
  end if;

  loop
    candidate := format('AMG-%s-%s', base, upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)));
    exit when not exists (
      select 1
      from public.profiles
      where amigo_id = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.build_registration_title()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', 'registration-legionnaire',
    'text', 'Легионер',
    'category', 'system',
    'icon', 'LEG',
    'tone', 'silver',
    'locked', true,
    'grantedBy', null,
    'description', 'Выдаётся автоматически за регистрацию в AmiGo.',
    'acquiredAt', timezone('utc', now())
  );
$$;

create or replace function public.build_alpha_title()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', 'alpha-pretorian',
    'text', 'Преторианец',
    'category', 'system',
    'icon', 'PRT',
    'tone', 'gold',
    'locked', true,
    'grantedBy', null,
    'description', 'Выдаётся за участие в раннем альфа-тесте проекта.',
    'acquiredAt', timezone('utc', now())
  );
$$;

create table if not exists public.alpha_invite_codes (
  code text primary key,
  label text not null default '',
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz
);

create table if not exists public.alpha_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.alpha_invite_codes (code) on delete restrict,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists alpha_invite_redemptions_code_idx on public.alpha_invite_redemptions (code);

alter table public.alpha_invite_codes enable row level security;
alter table public.alpha_invite_redemptions enable row level security;

create or replace function public.user_has_alpha_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.alpha_invite_redemptions
    where user_id = target_user
  );
$$;

create or replace function public.build_initial_titles_for_user(target_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb := jsonb_build_array(public.build_registration_title());
begin
  if public.user_has_alpha_access(target_user) then
    result := result || jsonb_build_array(public.build_alpha_title());
  end if;

  return public.normalize_profile_titles(result);
end;
$$;

create or replace function public.build_admin_title(
  title_text text,
  title_icon text,
  title_tone text,
  granted_by uuid default null
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', 'admin-custom',
    'text', trim(title_text),
    'category', 'admin',
    'icon', upper(coalesce(nullif(trim(title_icon), ''), 'ADM')),
    'tone', coalesce(nullif(trim(title_tone), ''), 'gold'),
    'locked', true,
    'grantedBy', granted_by,
    'description', 'Выдан администратором вручную.',
    'acquiredAt', timezone('utc', now())
  );
$$;

create or replace function public.normalize_profile_titles(input_titles jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  normalized jsonb := '[]'::jsonb;
  item jsonb;
begin
  if jsonb_typeof(input_titles) <> 'array' then
    normalized := jsonb_build_array(public.build_registration_title());
  else
    for item in
      select value
      from jsonb_array_elements(input_titles)
    loop
      if jsonb_typeof(item) = 'object'
         and coalesce(item->>'id', '') <> ''
         and coalesce(item->>'text', '') <> '' then
        normalized := normalized || jsonb_build_array(
          jsonb_build_object(
            'id', item->>'id',
            'text', item->>'text',
            'category', case when item->>'category' in ('system', 'admin') then item->>'category' else 'system' end,
            'icon', upper(coalesce(nullif(item->>'icon', ''), 'TAG')),
            'tone', case when item->>'tone' in ('silver', 'gold', 'cyan', 'royal') then item->>'tone' else 'silver' end,
            'locked', coalesce((item->>'locked')::boolean, true),
            'grantedBy', nullif(item->>'grantedBy', ''),
            'description', nullif(item->>'description', ''),
            'acquiredAt', nullif(item->>'acquiredAt', '')
          )
        );
      end if;
    end loop;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(normalized) as value
    where value->>'id' = 'registration-legionnaire'
  ) then
    normalized := jsonb_build_array(public.build_registration_title()) || normalized;
  end if;

  return (
    select coalesce(jsonb_agg(distinct_items.item), jsonb_build_array(public.build_registration_title()))
    from (
      select distinct on (value->>'id') value as item
      from jsonb_array_elements(normalized) as value
      order by value->>'id'
    ) as distinct_items
  );
end;
$$;

create or replace function public.resolve_active_title_id(
  input_titles jsonb,
  requested_id text
)
returns text
language plpgsql
stable
as $$
declare
  normalized jsonb := public.normalize_profile_titles(input_titles);
  first_id text;
begin
  if requested_id is not null and exists (
    select 1
    from jsonb_array_elements(normalized) as value
    where value->>'id' = requested_id
  ) then
    return requested_id;
  end if;

  select value->>'id'
  into first_id
  from jsonb_array_elements(normalized) as value
  limit 1;

  return first_id;
end;
$$;

create or replace function public.build_legacy_titles(
  legacy_title_text text,
  legacy_title_category text,
  legacy_title_icon text,
  legacy_title_tone text,
  legacy_granted_by uuid
)
returns jsonb
language plpgsql
stable
as $$
declare
  normalized_text text := trim(coalesce(legacy_title_text, ''));
  result jsonb := jsonb_build_array(public.build_registration_title());
begin
  if normalized_text = '' or normalized_text = 'Гражданин' or normalized_text = 'Легионер' then
    return result;
  end if;

  if normalized_text = 'Преторианец' then
    return result || jsonb_build_array(public.build_alpha_title());
  end if;

  if coalesce(legacy_title_category, 'system') = 'system' then
    return result || jsonb_build_array(
      jsonb_build_object(
        'id', 'legacy-system',
        'text', normalized_text,
        'category', 'system',
        'icon', upper(coalesce(nullif(trim(legacy_title_icon), ''), 'SYS')),
        'tone', coalesce(nullif(trim(legacy_title_tone), ''), 'silver'),
        'locked', true,
        'grantedBy', null
      )
    );
  end if;

  return result || jsonb_build_array(
    public.build_admin_title(
      normalized_text,
      coalesce(legacy_title_icon, 'ADM'),
      coalesce(legacy_title_tone, 'gold'),
      legacy_granted_by
    )
  );
end;
$$;

update public.profiles
set amigo_id = public.generate_amigo_id(name)
where amigo_id is null or btrim(amigo_id) = '';

update public.profiles
set state_id = public.generate_state_id()
where state_id is null or btrim(state_id) = '';

update public.profiles
set titles = public.build_legacy_titles(title_text, title_category, title_icon, title_tone, granted_by)
where titles is null
   or jsonb_typeof(titles) <> 'array'
   or jsonb_array_length(titles) = 0;

update public.profiles
set titles = public.normalize_profile_titles(titles),
    active_title_id = public.resolve_active_title_id(
      public.normalize_profile_titles(titles),
      coalesce(active_title_id, 'registration-legionnaire')
    );

alter table public.profiles alter column state_id set not null;
alter table public.profiles alter column amigo_id set not null;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null unique check (role in ('emperor')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_roles enable row level security;

create or replace function public.is_emperor_actor(actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = actor_id
      and role = 'emperor'
  );
$$;

create or replace function public.prepare_profile_system_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.state_id = coalesce(nullif(new.state_id, ''), public.generate_state_id());
    new.amigo_id = coalesce(nullif(new.amigo_id, ''), public.generate_amigo_id(new.name));

    if coalesce(auth.role(), '') <> 'service_role' then
      new.titles = jsonb_build_array(public.build_registration_title());
      new.active_title_id = 'registration-legionnaire';
      new.capability_flags = '{}'::text[];
      new.coin_balance = 0;
      new.title_text = 'Легионер';
      new.title_category = 'system';
      new.title_icon = 'LEG';
      new.title_tone = 'silver';
      new.title_locked = true;
      new.granted_by = null;
    else
      new.titles = public.normalize_profile_titles(coalesce(new.titles, '[]'::jsonb));
      new.active_title_id = public.resolve_active_title_id(new.titles, new.active_title_id);
    end if;
  else
    new.state_id = old.state_id;
    new.amigo_id = old.amigo_id;

    if coalesce(auth.role(), '') <> 'service_role' then
      new.titles = old.titles;
      new.active_title_id = public.resolve_active_title_id(old.titles, new.active_title_id);
      new.capability_flags = old.capability_flags;
      new.coin_balance = old.coin_balance;
    else
      new.titles = public.normalize_profile_titles(coalesce(new.titles, old.titles));
      new.active_title_id = public.resolve_active_title_id(new.titles, coalesce(new.active_title_id, old.active_title_id));
    end if;

    new.title_text = coalesce(
      (
        select value->>'text'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'Легионер'
    );
    new.title_category = coalesce(
      (
        select value->>'category'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'system'
    );
    new.title_icon = coalesce(
      (
        select value->>'icon'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'LEG'
    );
    new.title_tone = coalesce(
      (
        select value->>'tone'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'silver'
    );
    new.title_locked = true;
    new.granted_by = nullif(
      (
        select value->>'grantedBy'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      ''
    )::uuid;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists profiles_prepare_system_fields on public.profiles;
create trigger profiles_prepare_system_fields
before insert or update on public.profiles
for each row
execute function public.prepare_profile_system_fields();

create index if not exists profiles_amigo_id_idx on public.profiles (amigo_id);
create unique index if not exists profiles_state_id_idx on public.profiles (state_id);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references auth.users (id) on delete cascade,
  user_two uuid not null references auth.users (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint friendships_pair_unique unique (user_one, user_two),
  constraint friendships_two_users check (user_one <> user_two)
);

create index if not exists friendships_user_one_idx on public.friendships (user_one);
create index if not exists friendships_user_two_idx on public.friendships (user_two);

create table if not exists public.friendship_members (
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (friendship_id, user_id)
);

create index if not exists friendship_members_user_idx on public.friendship_members (user_id, friendship_id);

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint friend_requests_pair_unique unique (requester_id, recipient_id),
  constraint friend_requests_not_self check (requester_id <> recipient_id)
);

create index if not exists friend_requests_requester_idx on public.friend_requests (requester_id, status);
create index if not exists friend_requests_recipient_idx on public.friend_requests (recipient_id, status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'video', 'sticker', 'voice', 'video-note')),
  media_url text,
  media_path text,
  reply_to_message_id uuid references public.messages (id) on delete set null,
  deleted_for_all boolean not null default false,
  deleted_at timestamptz,
  forwarded_from_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.messages add column if not exists message_type text;
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists reply_to_message_id uuid references public.messages (id) on delete set null;
alter table public.messages add column if not exists deleted_for_all boolean not null default false;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists forwarded_from_message_id uuid references public.messages (id) on delete set null;
alter table public.messages alter column message_type set default 'text';
update public.messages set message_type = 'text' where message_type is null;
alter table public.messages alter column message_type set not null;
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check check (message_type in ('text', 'image', 'video', 'sticker', 'voice', 'video-note'));
alter table public.profiles drop constraint if exists profiles_age_check;
alter table public.profiles add constraint profiles_age_check check (age between 0 and 120);

create index if not exists messages_friendship_created_at_idx
  on public.messages (friendship_id, created_at);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.friendship_members enable row level security;
alter table public.friend_requests enable row level security;
alter table public.user_presence enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "user_presence_select_authenticated" on public.user_presence;
create policy "user_presence_select_authenticated"
on public.user_presence
for select
to authenticated
using (true);

drop policy if exists "user_presence_insert_own" on public.user_presence;
create policy "user_presence_insert_own"
on public.user_presence
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_presence_update_own" on public.user_presence;
create policy "user_presence_update_own"
on public.user_presence
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.set_updated_at();

create or replace function public.seed_friendship_members()
returns trigger
language plpgsql
as $$
begin
  insert into public.friendship_members (friendship_id, user_id, last_read_at)
  values
    (new.id, new.user_one, timezone('utc', now())),
    (new.id, new.user_two, timezone('utc', now()))
  on conflict (friendship_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists friendships_seed_members on public.friendships;
create trigger friendships_seed_members
after insert on public.friendships
for each row
execute function public.seed_friendship_members();

insert into public.friendship_members (friendship_id, user_id, last_read_at)
select id, user_one, created_at
from public.friendships
on conflict (friendship_id, user_id) do nothing;

insert into public.friendship_members (friendship_id, user_id, last_read_at)
select id, user_two, created_at
from public.friendships
on conflict (friendship_id, user_id) do nothing;

create or replace function public.set_custom_title(
  target_user uuid,
  next_title_text text,
  next_title_icon text default 'ADM',
  next_title_tone text default 'gold'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  next_titles jsonb;
  updated_profile public.profiles;
begin
  if not public.is_emperor_actor(auth.uid()) then
    raise exception 'Only the Emperor account can set custom titles.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user
  limit 1;

  if target_profile.id is null then
    raise exception 'Target user was not found in profiles.';
  end if;

  next_titles := (
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    from jsonb_array_elements(target_profile.titles) as value
    where value->>'id' <> 'admin-custom'
  ) || jsonb_build_array(public.build_admin_title(next_title_text, next_title_icon, next_title_tone, auth.uid()));

  update public.profiles
  set titles = next_titles,
      active_title_id = public.resolve_active_title_id(next_titles, target_profile.active_title_id),
      updated_at = timezone('utc', now())
  where id = target_user
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.set_custom_title(uuid, text, text, text) from public;
revoke all on function public.set_custom_title(uuid, text, text, text) from anon;
revoke all on function public.set_custom_title(uuid, text, text, text) from authenticated;

create or replace function public.grant_alpha_title(target_user uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  next_titles jsonb;
  updated_profile public.profiles;
begin
  if not public.is_emperor_actor(auth.uid()) then
    raise exception 'Only the Emperor account can grant alpha titles.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user
  limit 1;

  if target_profile.id is null then
    raise exception 'Target user was not found in profiles.';
  end if;

  next_titles := (
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    from jsonb_array_elements(target_profile.titles) as value
    where value->>'id' <> 'alpha-pretorian'
  ) || jsonb_build_array(public.build_alpha_title());

  update public.profiles
  set titles = next_titles,
      active_title_id = public.resolve_active_title_id(next_titles, target_profile.active_title_id),
      updated_at = timezone('utc', now())
  where id = target_user
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.grant_alpha_title(uuid) from public;
revoke all on function public.grant_alpha_title(uuid) from anon;
revoke all on function public.grant_alpha_title(uuid) from authenticated;

create or replace function public.set_active_profile_title(next_title_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target_profile public.profiles;
  resolved_title_id text;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = actor
  limit 1;

  if target_profile.id is null then
    raise exception 'Profile not found.';
  end if;

  resolved_title_id := public.resolve_active_title_id(target_profile.titles, next_title_id);

  if resolved_title_id <> next_title_id then
    raise exception 'Selected title is not available for this profile.';
  end if;

  update public.profiles
  set active_title_id = resolved_title_id,
      updated_at = timezone('utc', now())
  where id = actor;

  return resolved_title_id;
end;
$$;

grant execute on function public.set_active_profile_title(text) to authenticated;

create or replace function public.prepare_profile_system_fields()
returns trigger
language plpgsql
as $$
declare
  initial_titles jsonb;
begin
  if tg_op = 'INSERT' then
    new.state_id = coalesce(nullif(new.state_id, ''), public.generate_state_id());
    new.amigo_id = coalesce(nullif(new.amigo_id, ''), public.generate_amigo_id(new.name));

    if coalesce(auth.role(), '') <> 'service_role' then
      initial_titles := public.build_initial_titles_for_user(new.id);
      new.titles = initial_titles;
      new.active_title_id = public.resolve_active_title_id(initial_titles, 'registration-legionnaire');
      new.capability_flags = '{}'::text[];
      new.coin_balance = 0;
      new.title_text = 'Легионер';
      new.title_category = 'system';
      new.title_icon = 'LEG';
      new.title_tone = 'silver';
      new.title_locked = true;
      new.granted_by = null;
    else
      new.titles = public.normalize_profile_titles(coalesce(new.titles, '[]'::jsonb));
      new.active_title_id = public.resolve_active_title_id(new.titles, new.active_title_id);
    end if;
  else
    new.state_id = old.state_id;
    new.amigo_id = old.amigo_id;

    if coalesce(auth.role(), '') <> 'service_role' then
      new.titles = old.titles;
      new.active_title_id = public.resolve_active_title_id(old.titles, new.active_title_id);
      new.capability_flags = old.capability_flags;
      new.coin_balance = old.coin_balance;
    else
      new.titles = public.normalize_profile_titles(coalesce(new.titles, old.titles));
      new.active_title_id = public.resolve_active_title_id(new.titles, coalesce(new.active_title_id, old.active_title_id));
    end if;

    new.title_text = coalesce(
      (
        select value->>'text'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'Легионер'
    );
    new.title_category = coalesce(
      (
        select value->>'category'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'system'
    );
    new.title_icon = coalesce(
      (
        select value->>'icon'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'LEG'
    );
    new.title_tone = coalesce(
      (
        select value->>'tone'
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      'silver'
    );
    new.title_locked = coalesce(
      (
        select coalesce((value->>'locked')::boolean, true)
        from jsonb_array_elements(new.titles) as value
        where value->>'id' = new.active_title_id
        limit 1
      ),
      true
    );
    new.granted_by = (
      select nullif(value->>'grantedBy', '')::uuid
      from jsonb_array_elements(new.titles) as value
      where value->>'id' = new.active_title_id
      limit 1
    );
  end if;

  return new;
end;
$$;

create or replace function public.consume_alpha_invite(invite_code text, target_user uuid, target_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(trim(coalesce(invite_code, '')));
  target_record public.alpha_invite_codes;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only service role can consume alpha invites.';
  end if;

  if normalized_code = '' then
    raise exception 'Invite code is required.';
  end if;

  if target_user is null then
    raise exception 'Target user is required.';
  end if;

  select *
  into target_record
  from public.alpha_invite_codes
  where code = normalized_code
    and is_active = true
  for update;

  if target_record.code is null then
    raise exception 'Invite code was not found or is inactive.';
  end if;

  if target_record.used_count >= target_record.max_uses then
    raise exception 'Invite code has no remaining activations.';
  end if;

  insert into public.alpha_invite_redemptions (code, user_id, email)
  values (normalized_code, target_user, lower(trim(target_email)));

  update public.alpha_invite_codes
  set used_count = used_count + 1,
      last_used_at = timezone('utc', now())
  where code = normalized_code;

  return jsonb_build_object(
    'code', normalized_code,
    'remainingUses', greatest(target_record.max_uses - target_record.used_count - 1, 0)
  );
end;
$$;

revoke all on function public.consume_alpha_invite(text, uuid, text) from public;
revoke all on function public.consume_alpha_invite(text, uuid, text) from anon;
revoke all on function public.consume_alpha_invite(text, uuid, text) from authenticated;

create or replace function public.get_directory_profile_by_amigo_id(target_amigo_id text)
returns table (
  id uuid,
  amigo_id text,
  name text,
  age integer,
  bio text,
  avatar_url text,
  friendship_goal text,
  communication_formats text[],
  personality_tags text[],
  icebreaker text,
  availability text,
  titles jsonb,
  active_title_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    profiles.id,
    profiles.amigo_id,
    profiles.name,
    profiles.age,
    profiles.bio,
    profiles.avatar_url,
    profiles.friendship_goal,
    profiles.communication_formats,
    profiles.personality_tags,
    profiles.icebreaker,
    profiles.availability,
    profiles.titles,
    profiles.active_title_id,
    profiles.created_at,
    profiles.updated_at
  from public.profiles
  where profiles.amigo_id = upper(trim(target_amigo_id))
  limit 1;
$$;

create or replace function public.get_directory_profiles_by_ids(target_ids uuid[])
returns table (
  id uuid,
  amigo_id text,
  name text,
  age integer,
  bio text,
  avatar_url text,
  friendship_goal text,
  communication_formats text[],
  personality_tags text[],
  icebreaker text,
  availability text,
  titles jsonb,
  active_title_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    profiles.id,
    profiles.amigo_id,
    profiles.name,
    profiles.age,
    profiles.bio,
    profiles.avatar_url,
    profiles.friendship_goal,
    profiles.communication_formats,
    profiles.personality_tags,
    profiles.icebreaker,
    profiles.availability,
    profiles.titles,
    profiles.active_title_id,
    profiles.created_at,
    profiles.updated_at
  from public.profiles
  where profiles.id = any(target_ids);
$$;

grant execute on function public.get_directory_profile_by_amigo_id(text) to authenticated;
grant execute on function public.get_directory_profiles_by_ids(uuid[]) to authenticated;

create or replace function public.accept_friend_request(target_request uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target_row public.friend_requests;
  normalized_user_one uuid;
  normalized_user_two uuid;
  result_friendship uuid;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into target_row
  from public.friend_requests
  where id = target_request
    and status = 'pending'
  limit 1;

  if target_row.id is null then
    raise exception 'Request not found.';
  end if;

  if target_row.recipient_id <> actor then
    raise exception 'Only the recipient can accept the request.';
  end if;

  normalized_user_one := least(target_row.requester_id, target_row.recipient_id);
  normalized_user_two := greatest(target_row.requester_id, target_row.recipient_id);

  insert into public.friendships (user_one, user_two, created_by)
  values (normalized_user_one, normalized_user_two, actor)
  on conflict (user_one, user_two)
  do update set created_by = public.friendships.created_by
  returning id into result_friendship;

  update public.friend_requests
  set status = 'accepted',
      updated_at = timezone('utc', now())
  where id = target_request;

  update public.friend_requests
  set status = 'accepted',
      updated_at = timezone('utc', now())
  where requester_id = target_row.recipient_id
    and recipient_id = target_row.requester_id
    and status = 'pending';

  return result_friendship;
end;
$$;

create or replace function public.request_friendship(target_user uuid)
returns table (
  request_id uuid,
  became_friends boolean,
  friendship_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  existing_friendship public.friendships;
  reverse_request public.friend_requests;
  inserted_request public.friend_requests;
  accepted_friendship_id uuid;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  if target_user is null or actor = target_user then
    raise exception 'Invalid target user.';
  end if;

  select *
  into existing_friendship
  from public.friendships
  where (user_one = actor and user_two = target_user)
     or (user_one = target_user and user_two = actor)
  limit 1;

  if existing_friendship.id is not null then
    return query select null::uuid, true, existing_friendship.id;
    return;
  end if;

  select *
  into reverse_request
  from public.friend_requests
  where requester_id = target_user
    and recipient_id = actor
    and status = 'pending'
  limit 1;

  if reverse_request.id is not null then
    accepted_friendship_id := public.accept_friend_request(reverse_request.id);
    return query select reverse_request.id, true, accepted_friendship_id;
    return;
  end if;

  insert into public.friend_requests (requester_id, recipient_id, status)
  values (actor, target_user, 'pending')
  on conflict (requester_id, recipient_id)
  do update
    set status = 'pending',
        updated_at = timezone('utc', now())
  returning * into inserted_request;

  return query select inserted_request.id, false, null::uuid;
end;
$$;

grant execute on function public.request_friendship(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.mark_friendship_read(target_friendship uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  timestamp_value timestamptz := timezone('utc', now());
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  update public.friendship_members
  set last_read_at = timestamp_value
  where friendship_id = target_friendship
    and user_id = actor;

  if not found then
    raise exception 'Friendship membership not found.';
  end if;

  return timestamp_value;
end;
$$;

grant execute on function public.mark_friendship_read(uuid) to authenticated;

create or replace function public.touch_presence(next_online boolean default true)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  touched_at timestamptz := timezone('utc', now());
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.user_presence (user_id, is_online, last_seen_at, updated_at)
  values (actor, next_online, touched_at, touched_at)
  on conflict (user_id)
  do update set
    is_online = excluded.is_online,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at;

  return touched_at;
end;
$$;

grant execute on function public.touch_presence(boolean) to authenticated;

create or replace function public.delete_message_for_everyone(target_message uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target_row public.messages;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into target_row
  from public.messages
  where id = target_message
  limit 1;

  if target_row.id is null then
    raise exception 'Message not found.';
  end if;

  if target_row.sender_id <> actor then
    raise exception 'Only sender can delete message for everyone.';
  end if;

  update public.messages
  set body = 'Сообщение удалено',
      message_type = 'text',
      media_url = null,
      media_path = null,
      reply_to_message_id = null,
      forwarded_from_message_id = null,
      deleted_for_all = true,
      deleted_at = timezone('utc', now())
  where id = target_message;

  return target_message;
end;
$$;

grant execute on function public.delete_message_for_everyone(uuid) to authenticated;

drop policy if exists "friend_requests_select_members" on public.friend_requests;
create policy "friend_requests_select_members"
on public.friend_requests
for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists "friendships_select_members" on public.friendships;
create policy "friendships_select_members"
on public.friendships
for select
to authenticated
using (auth.uid() = user_one or auth.uid() = user_two);

drop policy if exists "friendship_members_select_own" on public.friendship_members;
create policy "friendship_members_select_own"
on public.friendship_members
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "friendship_members_update_own" on public.friendship_members;
create policy "friendship_members_update_own"
on public.friendship_members
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "messages_select_members" on public.messages;
create policy "messages_select_members"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.friendships
    where friendships.id = messages.friendship_id
      and (auth.uid() = friendships.user_one or auth.uid() = friendships.user_two)
  )
);

drop policy if exists "messages_insert_members" on public.messages;
create policy "messages_insert_members"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.friendships
    where friendships.id = messages.friendship_id
      and (auth.uid() = friendships.user_one or auth.uid() = friendships.user_two)
  )
);

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
on public.messages
for delete
to authenticated
using (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.friendships
    where friendships.id = messages.friendship_id
      and (auth.uid() = friendships.user_one or auth.uid() = friendships.user_two)
  )
);

create table if not exists public.arena_invites (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  arena_match_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arena_matches (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  player_one_id uuid not null references auth.users (id) on delete cascade,
  player_two_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'setup' check (status in ('setup', 'active', 'finished')),
  current_turn_user_id uuid references auth.users (id) on delete set null,
  winner_user_id uuid references auth.users (id) on delete set null,
  player_one_hp integer not null default 100,
  player_two_hp integer not null default 100,
  player_one_appearance text check (player_one_appearance in ('centurion', 'hoplite', 'knight', 'raider')),
  player_two_appearance text check (player_two_appearance in ('centurion', 'hoplite', 'knight', 'raider')),
  player_one_weapon text check (player_one_weapon in ('gladius', 'spear', 'axe', 'longsword')),
  player_two_weapon text check (player_two_weapon in ('gladius', 'spear', 'axe', 'longsword')),
  player_one_ready boolean not null default false,
  player_two_ready boolean not null default false,
  player_one_guarding boolean not null default false,
  player_two_guarding boolean not null default false,
  log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'arena_invites_match_fk'
  ) then
    alter table public.arena_invites
      add constraint arena_invites_match_fk
      foreign key (arena_match_id) references public.arena_matches (id) on delete set null;
  end if;
end;
$$;

alter table public.arena_invites enable row level security;
alter table public.arena_matches enable row level security;

drop trigger if exists arena_invites_set_updated_at on public.arena_invites;
create trigger arena_invites_set_updated_at
before update on public.arena_invites
for each row
execute function public.set_updated_at();

drop trigger if exists arena_matches_set_updated_at on public.arena_matches;
create trigger arena_matches_set_updated_at
before update on public.arena_matches
for each row
execute function public.set_updated_at();

drop policy if exists "arena_invites_select_members" on public.arena_invites;
create policy "arena_invites_select_members"
on public.arena_invites
for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "arena_matches_select_members" on public.arena_matches;
create policy "arena_matches_select_members"
on public.arena_matches
for select
to authenticated
using (auth.uid() = player_one_id or auth.uid() = player_two_id);

create or replace function public.create_arena_invite(target_friendship uuid)
returns public.arena_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  friendship_row public.friendships;
  recipient uuid;
  existing_invite public.arena_invites;
  created_invite public.arena_invites;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into friendship_row
  from public.friendships
  where id = target_friendship
    and (user_one = actor or user_two = actor)
  limit 1;

  if friendship_row.id is null then
    raise exception 'Friendship not found.';
  end if;

  recipient := case when friendship_row.user_one = actor then friendship_row.user_two else friendship_row.user_one end;

  select *
  into existing_invite
  from public.arena_invites
  where friendship_id = target_friendship
    and status = 'pending'
  order by created_at desc
  limit 1;

  if existing_invite.id is not null then
    return existing_invite;
  end if;

  insert into public.arena_invites (friendship_id, sender_id, recipient_id)
  values (target_friendship, actor, recipient)
  returning * into created_invite;

  return created_invite;
end;
$$;

grant execute on function public.create_arena_invite(uuid) to authenticated;

create or replace function public.respond_arena_invite(target_invite uuid, next_status text)
returns public.arena_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  invite_row public.arena_invites;
  created_match public.arena_matches;
  updated_invite public.arena_invites;
  friendship_row public.friendships;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  if next_status not in ('accepted', 'declined', 'cancelled') then
    raise exception 'Unsupported invite status.';
  end if;

  select *
  into invite_row
  from public.arena_invites
  where id = target_invite
  limit 1;

  if invite_row.id is null then
    raise exception 'Arena invite not found.';
  end if;

  if next_status = 'accepted' and invite_row.recipient_id <> actor then
    raise exception 'Only recipient can accept invite.';
  end if;

  if next_status in ('declined', 'cancelled') and invite_row.sender_id <> actor and invite_row.recipient_id <> actor then
    raise exception 'You cannot change this invite.';
  end if;

  if next_status = 'accepted' then
    select * into friendship_row from public.friendships where id = invite_row.friendship_id limit 1;

    insert into public.arena_matches (
      friendship_id,
      player_one_id,
      player_two_id,
      current_turn_user_id
    )
    values (
      invite_row.friendship_id,
      friendship_row.user_one,
      friendship_row.user_two,
      null
    )
    returning * into created_match;

    update public.arena_invites
    set status = 'accepted',
        arena_match_id = created_match.id,
        updated_at = timezone('utc', now())
    where id = target_invite
    returning * into updated_invite;
  else
    update public.arena_invites
    set status = next_status,
        updated_at = timezone('utc', now())
    where id = target_invite
    returning * into updated_invite;
  end if;

  return updated_invite;
end;
$$;

grant execute on function public.respond_arena_invite(uuid, text) to authenticated;

create or replace function public.submit_arena_loadout(target_match uuid, next_appearance text, next_weapon text)
returns public.arena_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  match_row public.arena_matches;
  updated_match public.arena_matches;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  if next_appearance not in ('centurion', 'hoplite', 'knight', 'raider') then
    raise exception 'Unsupported appearance.';
  end if;

  if next_weapon not in ('gladius', 'spear', 'axe', 'longsword') then
    raise exception 'Unsupported weapon.';
  end if;

  select *
  into match_row
  from public.arena_matches
  where id = target_match
    and (player_one_id = actor or player_two_id = actor)
  limit 1;

  if match_row.id is null then
    raise exception 'Arena match not found.';
  end if;

  update public.arena_matches
  set player_one_appearance = case when player_one_id = actor then next_appearance else player_one_appearance end,
      player_two_appearance = case when player_two_id = actor then next_appearance else player_two_appearance end,
      player_one_weapon = case when player_one_id = actor then next_weapon else player_one_weapon end,
      player_two_weapon = case when player_two_id = actor then next_weapon else player_two_weapon end,
      player_one_ready = case when player_one_id = actor then true else player_one_ready end,
      player_two_ready = case when player_two_id = actor then true else player_two_ready end,
      status = case
        when (case when player_one_id = actor then true else player_one_ready end)
         and (case when player_two_id = actor then true else player_two_ready end)
        then 'active'
        else status
      end,
      current_turn_user_id = case
        when (case when player_one_id = actor then true else player_one_ready end)
         and (case when player_two_id = actor then true else player_two_ready end)
         and current_turn_user_id is null
        then player_one_id
        else current_turn_user_id
      end,
      updated_at = timezone('utc', now())
  where id = target_match
  returning * into updated_match;

  if updated_match.status = 'active' and jsonb_array_length(updated_match.log) = 0 then
    update public.arena_matches
    set log = jsonb_build_array(
      jsonb_build_object(
        'actorId', null,
        'actorName', 'Система',
        'action', 'system',
        'text', 'Бой начинается. Первый ход у первого бойца.',
        'createdAt', timezone('utc', now())
      )
    )
    where id = target_match
    returning * into updated_match;
  end if;

  return updated_match;
end;
$$;

grant execute on function public.submit_arena_loadout(uuid, text, text) to authenticated;

create or replace function public.perform_arena_action(target_match uuid, next_action text)
returns public.arena_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  match_row public.arena_matches;
  actor_name text;
  is_player_one boolean;
  attacker_weapon text;
  damage integer := 0;
  reduced_damage integer := 0;
  target_hp integer;
  next_turn uuid;
  next_log jsonb;
  updated_match public.arena_matches;
begin
  if actor is null then
    raise exception 'Authentication required.';
  end if;

  if next_action not in ('quick', 'heavy', 'guard') then
    raise exception 'Unsupported arena action.';
  end if;

  select *
  into match_row
  from public.arena_matches
  where id = target_match
    and (player_one_id = actor or player_two_id = actor)
  limit 1;

  if match_row.id is null then
    raise exception 'Arena match not found.';
  end if;

  if match_row.status <> 'active' then
    raise exception 'Arena match is not active.';
  end if;

  if match_row.current_turn_user_id <> actor then
    raise exception 'It is not your turn.';
  end if;

  select name into actor_name from public.profiles where id = actor limit 1;
  is_player_one := match_row.player_one_id = actor;
  attacker_weapon := case when is_player_one then match_row.player_one_weapon else match_row.player_two_weapon end;
  next_turn := case when is_player_one then match_row.player_two_id else match_row.player_one_id end;

  if next_action = 'guard' then
    update public.arena_matches
    set player_one_guarding = case when is_player_one then true else false end,
        player_two_guarding = case when is_player_one then false else true end,
        current_turn_user_id = next_turn,
        log = coalesce(log, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'actorId', actor,
            'actorName', coalesce(actor_name, 'Боец'),
            'action', next_action,
            'text', coalesce(actor_name, 'Боец') || ' готовится отражать удар.',
            'createdAt', timezone('utc', now())
          )
        ),
        updated_at = timezone('utc', now())
    where id = target_match
    returning * into updated_match;

    return updated_match;
  end if;

  damage := case when next_action = 'quick' then 14 else 24 end;
  damage := damage + case
    when attacker_weapon = 'gladius' and next_action = 'quick' then 4
    when attacker_weapon = 'spear' and next_action = 'heavy' then 5
    when attacker_weapon = 'axe' and next_action = 'heavy' then 7
    when attacker_weapon = 'longsword' then 3
    else 0
  end;

  if is_player_one then
    if match_row.player_two_guarding then
      reduced_damage := greatest(4, floor(damage * 0.45));
      target_hp := greatest(0, match_row.player_two_hp - reduced_damage);
    else
      reduced_damage := damage;
      target_hp := greatest(0, match_row.player_two_hp - damage);
    end if;

    next_log := coalesce(match_row.log, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'actorId', actor,
        'actorName', coalesce(actor_name, 'Боец'),
        'action', next_action,
        'text', coalesce(actor_name, 'Боец') || ' наносит ' || reduced_damage || ' урона.',
        'createdAt', timezone('utc', now())
      )
    );

    update public.arena_matches
    set player_two_hp = target_hp,
        player_one_guarding = false,
        player_two_guarding = false,
        status = case when target_hp <= 0 then 'finished' else status end,
        winner_user_id = case when target_hp <= 0 then actor else winner_user_id end,
        current_turn_user_id = case when target_hp <= 0 then null else next_turn end,
        log = next_log,
        updated_at = timezone('utc', now())
    where id = target_match
    returning * into updated_match;
  else
    if match_row.player_one_guarding then
      reduced_damage := greatest(4, floor(damage * 0.45));
      target_hp := greatest(0, match_row.player_one_hp - reduced_damage);
    else
      reduced_damage := damage;
      target_hp := greatest(0, match_row.player_one_hp - damage);
    end if;

    next_log := coalesce(match_row.log, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'actorId', actor,
        'actorName', coalesce(actor_name, 'Боец'),
        'action', next_action,
        'text', coalesce(actor_name, 'Боец') || ' наносит ' || reduced_damage || ' урона.',
        'createdAt', timezone('utc', now())
      )
    );

    update public.arena_matches
    set player_one_hp = target_hp,
        player_one_guarding = false,
        player_two_guarding = false,
        status = case when target_hp <= 0 then 'finished' else status end,
        winner_user_id = case when target_hp <= 0 then actor else winner_user_id end,
        current_turn_user_id = case when target_hp <= 0 then null else next_turn end,
        log = next_log,
        updated_at = timezone('utc', now())
    where id = target_match
    returning * into updated_match;
  end if;

  return updated_match;
end;
$$;

grant execute on function public.perform_arena_action(uuid, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "chat_media_public_read" on storage.objects;
create policy "chat_media_public_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'chat-media');

drop policy if exists "chat_media_authenticated_upload" on storage.objects;
create policy "chat_media_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-media');

drop policy if exists "chat_media_authenticated_update" on storage.objects;
create policy "chat_media_authenticated_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'chat-media')
with check (bucket_id = 'chat-media');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'arena_invites'
  ) then
    alter publication supabase_realtime add table public.arena_invites;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'arena_matches'
  ) then
    alter publication supabase_realtime add table public.arena_matches;
  end if;
end;
$$;
