-- ============================================================================
-- SMART INVEST - Complete Supabase PostgreSQL Schema, RLS & Atomic RPCs
-- Run this script in your Supabase Project SQL Editor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'active' check (status in ('active', 'deactivated')),
  available_balance numeric(14, 2) not null default 0.00 check (available_balance >= 0),
  signup_bonus_credited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safely upgrade any pre-existing profiles table without losing registered member rows
do $$
declare
  v_constraint record;
begin
  alter table public.profiles add column if not exists full_name text not null default '';
  alter table public.profiles add column if not exists phone text not null default '';
  alter table public.profiles add column if not exists role text not null default 'member';
  alter table public.profiles add column if not exists status text not null default 'active';
  alter table public.profiles add column if not exists available_balance numeric(14, 2) not null default 0.00;
  alter table public.profiles add column if not exists signup_bonus_credited boolean not null default false;
  alter table public.profiles add column if not exists referral_code text;
  alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
  alter table public.profiles add column if not exists created_at timestamptz not null default now();
  alter table public.profiles add column if not exists updated_at timestamptz not null default now();

  -- Migrate legacy "balance" column values if present
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'balance'
  ) then
    execute '
      update public.profiles
      set available_balance = coalesce(balance, 0.00)
      where coalesce(available_balance, 0.00) = 0.00
        and balance is not null
        and balance >= 0
    ';
  end if;

  -- Drop older check constraints on role/status/available_balance before normalizing values
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%role%'
        or pg_get_constraintdef(oid) ilike '%status%'
        or pg_get_constraintdef(oid) ilike '%available_balance%'
      )
  loop
    execute format('alter table public.profiles drop constraint if exists %I', v_constraint.conname);
  end loop;

  update public.profiles
  set role = case when lower(coalesce(role, 'member')) = 'admin' then 'admin' else 'member' end,
      status = case when lower(coalesce(status, 'active')) = 'deactivated' then 'deactivated' else 'active' end,
      full_name = coalesce(full_name, ''),
      phone = coalesce(phone, ''),
      available_balance = greatest(coalesce(available_balance, 0.00), 0.00),
      referral_code = coalesce(
        nullif(upper(trim(referral_code)), ''),
        'SI' || upper(substr(replace(id::text, '-', ''), 1, 6))
      )
  where id is not null;

  alter table public.profiles alter column role set default 'member';
  alter table public.profiles alter column status set default 'active';
  alter table public.profiles alter column available_balance set default 0.00;

  alter table public.profiles add constraint profiles_role_check check (role in ('member', 'admin'));
  alter table public.profiles add constraint profiles_status_check check (status in ('active', 'deactivated'));
  alter table public.profiles add constraint profiles_available_balance_check check (available_balance >= 0);
end $$;

create unique index if not exists idx_profiles_referral_code_upper
  on public.profiles (upper(referral_code))
  where referral_code is not null;

create table if not exists public.investment_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tier_order integer not null default 1,
  price numeric(14, 2) not null check (price > 0),
  duration_days integer not null check (duration_days > 0),
  daily_return_rate numeric(6, 2) not null default 30.00 check (daily_return_rate >= 0 and daily_return_rate <= 100),
  summary text not null,
  terms_and_conditions text not null,
  risk_level text not null default 'Moderate' check (risk_level in ('Low-Moderate', 'Moderate', 'Moderate-High', 'High')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_packages
  add column if not exists daily_return_rate numeric(6, 2) not null default 30.00;

create table if not exists public.payment_instructions (
  id uuid primary key default gen_random_uuid(),
  method text not null unique check (method in ('bKash', 'Nagad', 'Rocket')),
  account_number text not null,
  account_type text not null default 'Merchant' check (account_type in ('Merchant', 'Agent', 'Personal')),
  instructions text not null,
  min_deposit numeric(14, 2) not null default 500.00 check (min_deposit > 0),
  max_deposit numeric(14, 2) not null default 500000.00 check (max_deposit >= min_deposit),
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('bKash', 'Nagad', 'Rocket')),
  sender_account text not null,
  transaction_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('bKash', 'Nagad', 'Rocket')),
  account_number text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Enforce at most one active pending withdrawal per member to prevent duplicate submissions
create unique index if not exists idx_one_pending_withdrawal_per_user
  on public.withdrawal_requests(user_id)
  where (status = 'pending');

create table if not exists public.package_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  package_id uuid not null references public.investment_packages(id) on delete restrict,
  package_name text not null,
  purchase_price numeric(14, 2) not null check (purchase_price > 0),
  duration_days integer not null check (duration_days > 0),
  daily_return_rate numeric(6, 2) not null default 30.00 check (daily_return_rate >= 0 and daily_return_rate <= 100),
  daily_reward_amount numeric(14, 2) not null default 0.00 check (daily_reward_amount >= 0),
  days_credited integer not null default 0 check (days_credited >= 0),
  total_credited numeric(14, 2) not null default 0.00 check (total_credited >= 0),
  last_credited_at timestamptz,
  terms_accepted boolean not null default false check (terms_accepted = true),
  terms_snapshot text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  starts_at timestamptz not null default now(),
  matures_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.package_purchases add column if not exists daily_return_rate numeric(6, 2) not null default 30.00;
alter table public.package_purchases add column if not exists daily_reward_amount numeric(14, 2) not null default 0.00;
alter table public.package_purchases add column if not exists days_credited integer not null default 0;
alter table public.package_purchases add column if not exists total_credited numeric(14, 2) not null default 0.00;
alter table public.package_purchases add column if not exists last_credited_at timestamptz;

update public.package_purchases
set daily_reward_amount = round(purchase_price * coalesce(daily_return_rate, 30.00) / 100.0, 2)
where daily_reward_amount = 0.00 and id is not null;

create table if not exists public.financial_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  entry_type text not null check (entry_type in ('signup_bonus', 'deposit_credit', 'withdrawal_hold', 'withdrawal_refund', 'package_purchase', 'package_reward', 'referral_commission')),
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14, 2) not null check (amount > 0),
  balance_before numeric(14, 2) not null check (balance_before >= 0),
  balance_after numeric(14, 2) not null check (balance_after >= 0),
  reference_table text not null,
  reference_id uuid not null,
  description text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
declare
  v_con record;
begin
  for v_con in
    select conname
    from pg_constraint
    where conrelid = 'public.financial_ledger'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%entry_type%'
  loop
    execute format('alter table public.financial_ledger drop constraint if exists %I', v_con.conname);
  end loop;
  alter table public.financial_ledger
    add constraint financial_ledger_entry_type_check
    check (entry_type in ('signup_bonus', 'deposit_credit', 'withdrawal_hold', 'withdrawal_refund', 'package_purchase', 'package_reward', 'referral_commission'));
end $$;

create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  purchase_id uuid not null unique references public.package_purchases(id) on delete restrict,
  package_name text not null,
  package_price numeric(14, 2) not null check (package_price > 0),
  commission_rate numeric(6, 2) not null default 35.00 check (commission_rate >= 0 and commission_rate <= 100),
  commission_amount numeric(14, 2) not null check (commission_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.support_settings (
  id integer primary key default 1 check (id = 1),
  support_title text not null default 'SMART INVEST Customer Support',
  support_hours text not null default '9:00 AM - 10:00 PM (GMT+6)',
  whatsapp_number text not null default '',
  telegram_link text not null default '',
  support_email text not null default '',
  notice_text text not null default 'Need help with deposits, withdrawals, or packages? Contact us or send a support message below.',
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.support_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  admin_reply text,
  replied_by uuid references public.profiles(id) on delete set null,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deposit_requests_user_created on public.deposit_requests(user_id, created_at desc);
create index if not exists idx_withdrawal_requests_user_created on public.withdrawal_requests(user_id, created_at desc);
create index if not exists idx_package_purchases_user_created on public.package_purchases(user_id, created_at desc);
create index if not exists idx_financial_ledger_user_created on public.financial_ledger(user_id, created_at desc);
create index if not exists idx_referral_commissions_referrer on public.referral_commissions(referrer_id, created_at desc);
create index if not exists idx_support_tickets_user_created on public.support_tickets(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. IMMUTABILITY & INTEGRITY TRIGGERS
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_packages_updated_at on public.investment_packages;
create trigger trg_packages_updated_at
  before update on public.investment_packages
  for each row execute function public.set_updated_at();

-- Prevent any UPDATE or DELETE on the financial_ledger table (append-only)
create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'financial_ledger is strictly immutable; updates and deletes are prohibited.';
end;
$$;

drop trigger if exists trg_financial_ledger_immutable on public.financial_ledger;
create trigger trg_financial_ledger_immutable
  before update or delete on public.financial_ledger
  for each row execute function public.prevent_ledger_mutation();

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- Prevent authenticated browser clients from mutating role, status, balance, or referral fields directly
create or replace function public.protect_profile_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.available_balance is distinct from old.available_balance
       or new.signup_bonus_credited is distinct from old.signup_bonus_credited
       or new.referral_code is distinct from old.referral_code
       or new.referred_by is distinct from old.referred_by
       or new.email is distinct from old.email then
      raise exception 'Direct modification of protected profile fields is forbidden.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_sensitive_columns();

-- Automatically provision a member profile when a new Supabase Auth user registers
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer_id uuid;
begin
  v_ref_code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  if v_ref_code <> '' then
    select id into v_referrer_id
    from public.profiles
    where upper(referral_code) = v_ref_code
      and id <> new.id
      and status = 'active'
    limit 1;
  end if;

  insert into public.profiles (
    id, email, full_name, phone, role, status, available_balance, signup_bonus_credited, referral_code, referred_by
  )
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'member',
    'active',
    100.00,
    true,
    'SI' || upper(substr(replace(new.id::text, '-', ''), 1, 6)),
    v_referrer_id
  )
  on conflict (id) do nothing;

  if found then
    insert into public.financial_ledger (
      user_id, entry_type, direction, amount,
      balance_before, balance_after,
      reference_table, reference_id, description, created_by
    ) values (
      new.id, 'signup_bonus', 'credit', 100.00,
      0.00, 100.00,
      'profiles', new.id,
      'Welcome signup bonus (৳100.00)',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

alter table public.profiles enable row level security;
alter table public.investment_packages enable row level security;
alter table public.payment_instructions enable row level security;
alter table public.deposit_requests enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.package_purchases enable row level security;
alter table public.financial_ledger enable row level security;
alter table public.referral_commissions enable row level security;
alter table public.support_settings enable row level security;
alter table public.support_tickets enable row level security;

-- profiles policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (
    auth.uid() = id
    and role = 'member'
    and status = 'active'
    and available_balance = 0.00
    and signup_bonus_credited = false
  );

drop policy if exists "profiles_update_own_safe_fields" on public.profiles;
create policy "profiles_update_own_safe_fields" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- investment_packages policies
drop policy if exists "packages_select_active_or_admin" on public.investment_packages;
create policy "packages_select_active_or_admin" on public.investment_packages
  for select using (is_active = true or public.is_admin());

drop policy if exists "packages_admin_write" on public.investment_packages;
create policy "packages_admin_write" on public.investment_packages
  for all using (public.is_admin()) with check (public.is_admin());

-- payment_instructions policies
drop policy if exists "instructions_select_authenticated" on public.payment_instructions;
create policy "instructions_select_authenticated" on public.payment_instructions
  for select using ((auth.uid() is not null and is_active = true) or public.is_admin());

drop policy if exists "instructions_admin_write" on public.payment_instructions;
create policy "instructions_admin_write" on public.payment_instructions
  for all using (public.is_admin()) with check (public.is_admin());

-- deposit_requests policies (read own or admin; mutations strictly via server/RPC)
drop policy if exists "deposits_select_own_or_admin" on public.deposit_requests;
create policy "deposits_select_own_or_admin" on public.deposit_requests
  for select using (auth.uid() = user_id or public.is_admin());

-- withdrawal_requests policies (read own or admin; mutations strictly via atomic RPC)
drop policy if exists "withdrawals_select_own_or_admin" on public.withdrawal_requests;
create policy "withdrawals_select_own_or_admin" on public.withdrawal_requests
  for select using (auth.uid() = user_id or public.is_admin());

-- package_purchases policies (read own or admin; mutations strictly via atomic RPC)
drop policy if exists "purchases_select_own_or_admin" on public.package_purchases;
create policy "purchases_select_own_or_admin" on public.package_purchases
  for select using (auth.uid() = user_id or public.is_admin());

-- financial_ledger policies (read own or admin; append-only via SECURITY DEFINER RPCs)
drop policy if exists "ledger_select_own_or_admin" on public.financial_ledger;
create policy "ledger_select_own_or_admin" on public.financial_ledger
  for select using (auth.uid() = user_id or public.is_admin());

-- referral_commissions policies (read own referrer/referred or admin; inserts strictly via purchase_package RPC)
drop policy if exists "referrals_select_own_or_admin" on public.referral_commissions;
create policy "referrals_select_own_or_admin" on public.referral_commissions
  for select using (auth.uid() = referrer_id or auth.uid() = referred_user_id or public.is_admin());

-- support_settings policies (public read when active; admin write)
drop policy if exists "support_settings_select_active_or_admin" on public.support_settings;
create policy "support_settings_select_active_or_admin" on public.support_settings
  for select using (is_active = true or public.is_admin());

drop policy if exists "support_settings_admin_write" on public.support_settings;
create policy "support_settings_admin_write" on public.support_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- support_tickets policies (read/insert own; admin read/update all)
drop policy if exists "support_tickets_select_own_or_admin" on public.support_tickets;
create policy "support_tickets_select_own_or_admin" on public.support_tickets
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (auth.uid() = user_id and status = 'open');

drop policy if exists "support_tickets_admin_update" on public.support_tickets;
create policy "support_tickets_admin_update" on public.support_tickets
  for update using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. ATOMIC TRANSACTIONAL STORED PROCEDURES (RPCs)
-- ----------------------------------------------------------------------------

-- 4A. Approve Deposit (Atomic balance credit + immutable ledger entry)
create or replace function public.approve_deposit(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles%rowtype;
  v_deposit public.deposit_requests%rowtype;
  v_member public.profiles%rowtype;
  v_balance_before numeric(14, 2);
  v_balance_after numeric(14, 2);
begin
  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'admin' or v_admin.status <> 'active' then
    raise exception 'Unauthorized: active admin privileges required.';
  end if;

  select * into v_deposit
  from public.deposit_requests
  where id = p_deposit_id
  for update;

  if not found then
    raise exception 'Deposit request not found.';
  end if;

  if v_deposit.status <> 'pending' then
    raise exception 'Deposit request has already been processed (status: %).', v_deposit.status;
  end if;

  select * into v_member
  from public.profiles
  where id = v_deposit.user_id
  for update;

  if not found then
    raise exception 'Member profile not found.';
  end if;

  v_balance_before := v_member.available_balance;
  v_balance_after := round(v_balance_before + v_deposit.amount, 2);

  update public.profiles
  set available_balance = v_balance_after
  where id = v_member.id;

  update public.deposit_requests
  set status = 'approved',
      admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = v_deposit.id;

  insert into public.financial_ledger (
    user_id, entry_type, direction, amount,
    balance_before, balance_after,
    reference_table, reference_id, description, created_by
  ) values (
    v_member.id, 'deposit_credit', 'credit', v_deposit.amount,
    v_balance_before, v_balance_after,
    'deposit_requests', v_deposit.id,
    format('Verified %s deposit (Txn: %s)', v_deposit.payment_method, v_deposit.transaction_id),
    p_admin_id
  );

  return jsonb_build_object(
    'deposit_id', v_deposit.id,
    'status', 'approved',
    'balance_after', v_balance_after
  );
end;
$$;

-- 4B. Reject Deposit
create or replace function public.reject_deposit(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles%rowtype;
  v_deposit public.deposit_requests%rowtype;
begin
  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'admin' or v_admin.status <> 'active' then
    raise exception 'Unauthorized: active admin privileges required.';
  end if;

  select * into v_deposit
  from public.deposit_requests
  where id = p_deposit_id
  for update;

  if not found then
    raise exception 'Deposit request not found.';
  end if;

  if v_deposit.status <> 'pending' then
    raise exception 'Deposit request has already been processed (status: %).', v_deposit.status;
  end if;

  update public.deposit_requests
  set status = 'rejected',
      admin_note = coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), 'Payment could not be verified.'),
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = v_deposit.id;

  return jsonb_build_object(
    'deposit_id', v_deposit.id,
    'status', 'rejected'
  );
end;
$$;

-- 4C. Request Withdrawal (Atomic balance hold + duplicate/double-spend prevention)
create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_method text,
  p_account_number text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles%rowtype;
  v_existing public.withdrawal_requests%rowtype;
  v_amount numeric(14, 2);
  v_balance_before numeric(14, 2);
  v_balance_after numeric(14, 2);
  v_new_id uuid;
begin
  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Withdrawal amount must be greater than zero.';
  end if;

  if p_method not in ('bKash', 'Nagad', 'Rocket') then
    raise exception 'Unsupported withdrawal method.';
  end if;

  -- Idempotency check
  select * into v_existing
  from public.withdrawal_requests
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.user_id = p_user_id then
      return jsonb_build_object(
        'withdrawal_id', v_existing.id,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    else
      raise exception 'Invalid idempotency key.';
    end if;
  end if;

  -- Lock member row to prevent concurrent double spending
  select * into v_member
  from public.profiles
  where id = p_user_id
  for update;

  if not found or v_member.status <> 'active' then
    raise exception 'Account is not active.';
  end if;

  -- Prevent duplicate pending withdrawals
  if exists (
    select 1 from public.withdrawal_requests
    where user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'You already have a pending withdrawal request awaiting review.';
  end if;

  if v_member.available_balance < v_amount then
    raise exception 'Insufficient verified balance for this withdrawal.';
  end if;

  v_balance_before := v_member.available_balance;
  v_balance_after := round(v_balance_before - v_amount, 2);

  update public.profiles
  set available_balance = v_balance_after
  where id = p_user_id;

  insert into public.withdrawal_requests (
    user_id, amount, payment_method, account_number, idempotency_key, status
  ) values (
    p_user_id, v_amount, p_method, trim(p_account_number), p_idempotency_key, 'pending'
  )
  returning id into v_new_id;

  insert into public.financial_ledger (
    user_id, entry_type, direction, amount,
    balance_before, balance_after,
    reference_table, reference_id, description, created_by
  ) values (
    p_user_id, 'withdrawal_hold', 'debit', v_amount,
    v_balance_before, v_balance_after,
    'withdrawal_requests', v_new_id,
    format('Withdrawal request hold via %s (%s)', p_method, trim(p_account_number)),
    p_user_id
  );

  return jsonb_build_object(
    'withdrawal_id', v_new_id,
    'status', 'pending',
    'balance_after', v_balance_after
  );
end;
$$;

-- 4D. Approve Withdrawal
create or replace function public.approve_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles%rowtype;
  v_withdrawal public.withdrawal_requests%rowtype;
begin
  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'admin' or v_admin.status <> 'active' then
    raise exception 'Unauthorized: active admin privileges required.';
  end if;

  select * into v_withdrawal
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found.';
  end if;

  if v_withdrawal.status <> 'pending' then
    raise exception 'Withdrawal request has already been processed (status: %).', v_withdrawal.status;
  end if;

  update public.withdrawal_requests
  set status = 'approved',
      admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = v_withdrawal.id;

  return jsonb_build_object(
    'withdrawal_id', v_withdrawal.id,
    'status', 'approved'
  );
end;
$$;

-- 4E. Reject Withdrawal (Atomic refund to verified balance + immutable ledger entry)
create or replace function public.reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles%rowtype;
  v_withdrawal public.withdrawal_requests%rowtype;
  v_member public.profiles%rowtype;
  v_balance_before numeric(14, 2);
  v_balance_after numeric(14, 2);
begin
  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'admin' or v_admin.status <> 'active' then
    raise exception 'Unauthorized: active admin privileges required.';
  end if;

  select * into v_withdrawal
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found.';
  end if;

  if v_withdrawal.status <> 'pending' then
    raise exception 'Withdrawal request has already been processed (status: %).', v_withdrawal.status;
  end if;

  select * into v_member
  from public.profiles
  where id = v_withdrawal.user_id
  for update;

  v_balance_before := v_member.available_balance;
  v_balance_after := round(v_balance_before + v_withdrawal.amount, 2);

  update public.profiles
  set available_balance = v_balance_after
  where id = v_member.id;

  update public.withdrawal_requests
  set status = 'rejected',
      admin_note = coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), 'Withdrawal declined; funds returned to available balance.'),
      reviewed_by = p_admin_id,
      reviewed_at = now()
  where id = v_withdrawal.id;

  insert into public.financial_ledger (
    user_id, entry_type, direction, amount,
    balance_before, balance_after,
    reference_table, reference_id, description, created_by
  ) values (
    v_member.id, 'withdrawal_refund', 'credit', v_withdrawal.amount,
    v_balance_before, v_balance_after,
    'withdrawal_requests', v_withdrawal.id,
    format('Refund for declined %s withdrawal', v_withdrawal.payment_method),
    p_admin_id
  );

  return jsonb_build_object(
    'withdrawal_id', v_withdrawal.id,
    'status', 'rejected',
    'balance_after', v_balance_after
  );
end;
$$;

-- 4F. Purchase Investment Package (Atomic verified-balance deduction + 35% referral commission + ledger entry)
create or replace function public.purchase_package(
  p_user_id uuid,
  p_package_id uuid,
  p_terms_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles%rowtype;
  v_referrer public.profiles%rowtype;
  v_package public.investment_packages%rowtype;
  v_balance_before numeric(14, 2);
  v_balance_after numeric(14, 2);
  v_daily_rate numeric(6, 2);
  v_daily_reward numeric(14, 2);
  v_purchase_id uuid;
  v_comm_id uuid;
  v_comm_rate numeric(6, 2) := 35.00;
  v_comm_amount numeric(14, 2) := 0.00;
  v_ref_before numeric(14, 2);
  v_ref_after numeric(14, 2);
  v_starts_at timestamptz := now();
  v_matures_at timestamptz;
begin
  if p_terms_accepted is distinct from true then
    raise exception 'You must accept the package terms and risk disclosures before purchasing.';
  end if;

  select * into v_member
  from public.profiles
  where id = p_user_id
  for update;

  if not found or v_member.status <> 'active' then
    raise exception 'Account is not active.';
  end if;

  select * into v_package
  from public.investment_packages
  where id = p_package_id;

  if not found or v_package.is_active is distinct from true then
    raise exception 'Selected investment package is currently unavailable.';
  end if;

  if v_member.available_balance < v_package.price then
    raise exception 'Insufficient verified balance to purchase %.', v_package.name;
  end if;

  v_balance_before := v_member.available_balance;
  v_balance_after := round(v_balance_before - v_package.price, 2);
  v_daily_rate := coalesce(v_package.daily_return_rate, 30.00);
  v_daily_reward := round(v_package.price * v_daily_rate / 100.0, 2);
  v_matures_at := v_starts_at + make_interval(days => v_package.duration_days);

  update public.profiles
  set available_balance = v_balance_after
  where id = p_user_id;

  insert into public.package_purchases (
    user_id, package_id, package_name, purchase_price,
    duration_days, daily_return_rate, daily_reward_amount,
    days_credited, total_credited, terms_accepted, terms_snapshot,
    status, starts_at, matures_at
  ) values (
    p_user_id, v_package.id, v_package.name, v_package.price,
    v_package.duration_days, v_daily_rate, v_daily_reward,
    0, 0.00, true, v_package.terms_and_conditions,
    'active', v_starts_at, v_matures_at
  )
  returning id into v_purchase_id;

  insert into public.financial_ledger (
    user_id, entry_type, direction, amount,
    balance_before, balance_after,
    reference_table, reference_id, description, created_by
  ) values (
    p_user_id, 'package_purchase', 'debit', v_package.price,
    v_balance_before, v_balance_after,
    'package_purchases', v_purchase_id,
    format('Purchased %s (%s days @ %s%%/day demo rate)', v_package.name, v_package.duration_days, v_daily_rate),
    p_user_id
  );

  -- Credit 35% referral commission to active referrer if member was referred
  if v_member.referred_by is not null and v_member.referred_by <> p_user_id then
    select * into v_referrer
    from public.profiles
    where id = v_member.referred_by
    for update;

    if found and v_referrer.status = 'active' then
      v_comm_amount := round(v_package.price * v_comm_rate / 100.0, 2);
      if v_comm_amount > 0 then
        v_ref_before := v_referrer.available_balance;
        v_ref_after := round(v_ref_before + v_comm_amount, 2);

        update public.profiles
        set available_balance = v_ref_after
        where id = v_referrer.id;

        insert into public.referral_commissions (
          referrer_id, referred_user_id, purchase_id,
          package_name, package_price, commission_rate, commission_amount
        ) values (
          v_referrer.id, p_user_id, v_purchase_id,
          v_package.name, v_package.price, v_comm_rate, v_comm_amount
        )
        returning id into v_comm_id;

        insert into public.financial_ledger (
          user_id, entry_type, direction, amount,
          balance_before, balance_after,
          reference_table, reference_id, description, created_by
        ) values (
          v_referrer.id, 'referral_commission', 'credit', v_comm_amount,
          v_ref_before, v_ref_after,
          'referral_commissions', v_comm_id,
          format('35%% referral commission from %s (%s)', coalesce(nullif(trim(v_member.full_name), ''), v_member.email), v_package.name),
          p_user_id
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'package_name', v_package.name,
    'daily_return_rate', v_daily_rate,
    'daily_reward_amount', v_daily_reward,
    'balance_after', v_balance_after,
    'matures_at', v_matures_at,
    'referral_commission_credited', v_comm_amount
  );
end;
$$;

-- 4G. Claim Daily Demo Package Return (Atomic 24-hour enforced credit + immutable ledger entry)
create or replace function public.claim_package_reward(
  p_user_id uuid,
  p_purchase_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles%rowtype;
  v_purchase public.package_purchases%rowtype;
  v_next_claim_at timestamptz;
  v_reward numeric(14, 2);
  v_balance_before numeric(14, 2);
  v_balance_after numeric(14, 2);
  v_new_days integer;
  v_new_total numeric(14, 2);
  v_new_status text;
begin
  select * into v_purchase
  from public.package_purchases
  where id = p_purchase_id
  for update;

  if not found or v_purchase.user_id <> p_user_id then
    raise exception 'Package allocation not found.';
  end if;

  if v_purchase.status <> 'active' then
    raise exception 'This package allocation has already completed.';
  end if;

  if coalesce(v_purchase.days_credited, 0) >= v_purchase.duration_days then
    raise exception 'All % daily cycles for this package have already been credited.', v_purchase.duration_days;
  end if;

  select * into v_member
  from public.profiles
  where id = p_user_id
  for update;

  if not found or v_member.status <> 'active' then
    raise exception 'Account is not active.';
  end if;

  v_next_claim_at := coalesce(v_purchase.last_credited_at, v_purchase.starts_at) + interval '24 hours';
  if now() < v_next_claim_at then
    raise exception 'Next daily demo payout unlocks at %.', to_char(v_next_claim_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC');
  end if;

  v_reward := coalesce(
    nullif(v_purchase.daily_reward_amount, 0),
    round(v_purchase.purchase_price * coalesce(v_purchase.daily_return_rate, 30.00) / 100.0, 2)
  );
  if v_reward <= 0 then
    raise exception 'This package does not have a positive daily return configured.';
  end if;

  v_balance_before := v_member.available_balance;
  v_balance_after := round(v_balance_before + v_reward, 2);
  v_new_days := coalesce(v_purchase.days_credited, 0) + 1;
  v_new_total := round(coalesce(v_purchase.total_credited, 0) + v_reward, 2);
  v_new_status := case when v_new_days >= v_purchase.duration_days then 'completed' else 'active' end;

  update public.profiles
  set available_balance = v_balance_after
  where id = p_user_id;

  update public.package_purchases
  set days_credited = v_new_days,
      total_credited = v_new_total,
      last_credited_at = now(),
      status = v_new_status
  where id = v_purchase.id;

  insert into public.financial_ledger (
    user_id, entry_type, direction, amount,
    balance_before, balance_after,
    reference_table, reference_id, description, created_by
  ) values (
    p_user_id, 'package_reward', 'credit', v_reward,
    v_balance_before, v_balance_after,
    'package_purchases', v_purchase.id,
    format('Demo daily return (%s%% · Day %s/%s) for %s', coalesce(v_purchase.daily_return_rate, 30.00), v_new_days, v_purchase.duration_days, v_purchase.package_name),
    p_user_id
  );

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'days_credited', v_new_days,
    'duration_days', v_purchase.duration_days,
    'reward_amount', v_reward,
    'total_credited', v_new_total,
    'balance_after', v_balance_after,
    'status', v_new_status
  );
end;
$$;

-- Restrict RPC execution to service_role (server-side backend) so client cannot call admin RPCs directly
revoke all on function public.approve_deposit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_deposit(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.request_withdrawal(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.approve_withdrawal(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_withdrawal(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.purchase_package(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_package_reward(uuid, uuid) from public, anon, authenticated;

grant execute on function public.approve_deposit(uuid, uuid, text) to service_role;
grant execute on function public.reject_deposit(uuid, uuid, text) to service_role;
grant execute on function public.request_withdrawal(uuid, numeric, text, text, text) to service_role;
grant execute on function public.approve_withdrawal(uuid, uuid, text) to service_role;
grant execute on function public.reject_withdrawal(uuid, uuid, text) to service_role;
grant execute on function public.purchase_package(uuid, uuid, boolean) to service_role;
grant execute on function public.claim_package_reward(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 5. SEED DATA (Packages & Payment Instructions)
-- ----------------------------------------------------------------------------

insert into public.investment_packages (slug, name, tier_order, price, duration_days, summary, terms_and_conditions, risk_level, is_active)
values
  (
    'starter',
    'Starter Package',
    1,
    2000.00,
    30,
    'Entry-level 30-day structured allocation designed for members exploring disciplined capital participation.',
    '1. Capital Participation: Purchasing the Starter Package allocates 2,000 BDT from your verified available balance for a fixed 30-day term.\n2. Risk Disclosure: Market-linked allocations carry risk of capital fluctuation or loss. No fixed profit or guaranteed return is promised.\n3. Lock-In Period: Allocated funds remain committed during the 30-day duration and cannot be withdrawn early.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    'Low-Moderate',
    true
  ),
  (
    'silver',
    'Silver Package',
    2,
    10000.00,
    60,
    'Balanced 60-day diversified portfolio allocation with periodic reporting inside your member ledger.',
    '1. Capital Participation: Purchasing the Silver Package allocates 10,000 BDT from your verified available balance for a 60-day term.\n2. Risk Disclosure: Returns are variable and depend on market conditions. Past outcomes do not guarantee future performance.\n3. Lock-In Period: Allocated principal is committed for the full 60-day duration.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    'Moderate',
    true
  ),
  (
    'gold',
    'Gold Package',
    3,
    25000.00,
    90,
    'Medium-horizon 90-day multi-sector allocation built for members seeking structured quarterly participation.',
    '1. Capital Participation: Purchasing the Gold Package allocates 25,000 BDT from your verified available balance for a 90-day term.\n2. Risk Disclosure: All investments involve risk, including potential loss of principal. SMART INVEST does not guarantee profits.\n3. Lock-In Period: Funds remain committed for 90 calendar days from the purchase timestamp.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    'Moderate-High',
    true
  ),
  (
    'premium',
    'Premium Package',
    4,
    50000.00,
    180,
    'Longer-horizon 180-day institutional-style allocation with comprehensive ledger auditability.',
    '1. Capital Participation: Purchasing the Premium Package allocates 50,000 BDT from your verified available balance for a 180-day term.\n2. Risk Disclosure: Higher-horizon strategies carry market, liquidity, and counterparty risks. No return is guaranteed.\n3. Lock-In Period: Funds remain locked for the 180-day duration prior to settlement review.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    'High',
    true
  )
on conflict (slug) do nothing;

insert into public.payment_instructions (method, account_number, account_type, instructions, min_deposit, max_deposit, is_active)
values
  (
    'bKash',
    'Configure in Admin Panel',
    'Merchant',
    'Open bKash App -> Select Payment or Send Money -> Enter the verified account number above -> Enter exact deposit amount -> Copy the Transaction ID (TrxID) and submit it below for manual admin review.',
    500.00,
    500000.00,
    true
  ),
  (
    'Nagad',
    'Configure in Admin Panel',
    'Merchant',
    'Open Nagad App -> Select Merchant Pay or Send Money -> Enter the verified account number above -> Complete payment -> Copy the Transaction ID and submit it below for manual admin verification.',
    500.00,
    500000.00,
    true
  ),
  (
    'Rocket',
    'Configure in Admin Panel',
    'Agent',
    'Open Rocket App or dial *322# -> Send Money / Payment to the verified account number above -> Save your Transaction ID and submit the request below. Balances update only after admin approval.',
    500.00,
    500000.00,
    true
  )
on conflict (method) do nothing;

-- Force PostgREST API schema cache to refresh immediately after creating tables/RPCs
notify pgrst, 'reload schema';

-- ============================================================================
-- TO PROMOTE YOUR FIRST ADMIN USER (run after registering your account):
-- update public.profiles set role = 'admin' where email = 'your-admin@example.com';
-- ============================================================================
