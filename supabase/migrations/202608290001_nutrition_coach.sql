create table public.consents (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  kind text not null,
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.nutrition_profiles (
  customer_id text primary key,
  shop_domain text not null,
  age integer not null check (age between 18 and 100),
  sex text,
  height_cm numeric not null check (height_cm between 120 and 230),
  weight_kg numeric not null check (weight_kg between 35 and 300),
  activity text not null,
  goal text not null,
  medical_flags text[] not null default '{}',
  target jsonb,
  needs_professional_guidance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.nutrition_profiles(customer_id) on delete cascade,
  eaten_on date not null,
  name text not null,
  source text not null check (source in ('manual', 'barcode', 'restaurant_photo')),
  calories numeric,
  protein_g numeric,
  carbohydrate_g numeric,
  fat_g numeric,
  fibre_g numeric,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.nutrition_profiles(customer_id) on delete cascade,
  activity_on date not null,
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  intensity text not null,
  competition boolean not null default false,
  adjustment jsonb not null,
  created_at timestamptz not null default now()
);

create index meal_entries_customer_day_idx on public.meal_entries (customer_id, eaten_on);
create index activity_entries_customer_day_idx on public.activity_entries (customer_id, activity_on);

alter table public.consents enable row level security;
alter table public.nutrition_profiles enable row level security;
alter table public.meal_entries enable row level security;
alter table public.activity_entries enable row level security;

insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
on conflict (id) do update set public = false;

-- No anon/authenticated policies are intentionally created. Only the trusted,
-- server-side service role used by the validated Shopify App Proxy can access data.
