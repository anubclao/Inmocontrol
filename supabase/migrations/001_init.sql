/**
 * Migraciones SQL de Supabase para InmoControl.
 *
 * Cómo aplicar:
 *   1. Crear proyecto en https://supabase.com
 *   2. Ir a SQL Editor → New query
 *   3. Pegar TODO este archivo y ejecutar
 *   4. Las RLS policies garantizan que cada usuario solo ve datos de su org
 *
 * Tablas:
 *   - organizations        : inmobiliarias (multi-tenant root)
 *   - profiles             : usuarios vinculados a una org
 *   - properties           : inmuebles
 *   - tenants              : inquilinos
 *   - contracts            : contratos de arrendamiento
 *   - financial_records    : movimientos contables
 *   - inventories          : inventarios inicial/final
 *
 * Convention: cada tabla "hijo" tiene organization_id para multi-tenant.
 * Las policies usan auth.uid() para resolver el org_id del usuario actual.
 */

-- ─── Tabla raíz: organizations ───────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nit text,
  address text,
  phone text,
  website text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Perfiles de usuario ───────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  email text not null,
  role text not null default 'admin' check (role in ('admin', 'gestor', 'propietario', 'inquilino')),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper: org_id del usuario actual
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid() limit 1;
$$;

-- ─── Inmuebles ──────────────────────────────────────────────
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  address text not null,
  chip text,
  folio text,
  owner_name text not null,
  owner_id_number text,
  status text not null default 'available' check (status in ('available', 'rented', 'maintenance', 'inactive')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Inquilinos ─────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document_id text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- ─── Contratos ──────────────────────────────────────────────
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  rent_amount numeric(14, 2) not null,
  admin_fee numeric(14, 2) not null default 0,
  commission_pct numeric(5, 2) not null default 8,
  insurance_pct numeric(5, 2) not null default 0,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'expiring', 'expired', 'terminated')),
  renewal_strategy text not null default 'manual' check (renewal_strategy in ('auto', 'manual', 'none')),
  inventory_end_required boolean not null default true,
  notes text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Movimientos contables ──────────────────────────────────
create table if not exists public.financial_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  property_id uuid not null references public.properties(id) on delete cascade,
  date date not null,
  type text not null check (type in ('Ingreso', 'Egreso')),
  category text not null,
  description text not null,
  amount numeric(14, 2) not null,
  attachment_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ─── Inventarios ────────────────────────────────────────────
create table if not exists public.inventories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  phase text not null check (phase in ('inicial', 'final')),
  property_type text not null,
  counters jsonb not null default '{}',
  areas jsonb not null default '[]',
  photos jsonb not null default '[]',
  signatures jsonb not null default '[]',
  signed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, phase)
);

-- ─── RLS: habilitar en todas las tablas ─────────────────────
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.tenants enable row level security;
alter table public.contracts enable row level security;
alter table public.financial_records enable row level security;
alter table public.inventories enable row level security;

-- ─── Policies: aislamiento por organización ──────────────────
-- Solo el propio usuario lee su perfil
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

-- Profiles: solo el admin de la org puede insertar/actualizar perfiles de su org
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all using (
    organization_id = public.current_org_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Properties: lectura/escritura para usuarios de la misma org
drop policy if exists "properties_org_isolation" on public.properties;
create policy "properties_org_isolation" on public.properties
  for all using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

drop policy if exists "tenants_org_isolation" on public.tenants;
create policy "tenants_org_isolation" on public.tenants
  for all using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

drop policy if exists "contracts_org_isolation" on public.contracts;
create policy "contracts_org_isolation" on public.contracts
  for all using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

drop policy if exists "financial_records_org_isolation" on public.financial_records;
create policy "financial_records_org_isolation" on public.financial_records
  for all using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

drop policy if exists "inventories_org_isolation" on public.inventories;
create policy "inventories_org_isolation" on public.inventories
  for all using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

-- Organizations: usuario solo ve su propia organización
drop policy if exists "organizations_self_read" on public.organizations;
create policy "organizations_self_read" on public.organizations
  for select using (id = public.current_org_id());

drop policy if exists "organizations_admin_update" on public.organizations;
create policy "organizations_admin_update" on public.organizations
  for update using (
    id = public.current_org_id()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ─── Índices útiles ─────────────────────────────────────────
create index if not exists properties_org_idx on public.properties(organization_id);
create index if not exists contracts_property_idx on public.contracts(property_id);
create index if not exists contracts_status_idx on public.contracts(status);
create index if not exists financial_records_property_date_idx on public.financial_records(property_id, date);
create index if not exists inventories_property_phase_idx on public.inventories(property_id, phase);
