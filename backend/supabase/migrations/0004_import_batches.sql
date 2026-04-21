-- ============================================================================
-- Import batches — history + undo for the bulletproof importer
-- ============================================================================
-- Every import run gets a row in import_batches. Transactions created by that
-- run carry `import_batch_id` so we can list / undo / re-run a whole batch.
--
-- We also stash the original uploaded file text (or a truncated preview for
-- binary/huge files) + the final mapping config, so the user can re-run a
-- batch with a different mapping without re-uploading.
-- ============================================================================

create table public.import_batches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  file_kind text not null,               -- 'csv' | 'tsv' | 'xlsx' | 'json' | 'ofx' | 'pdf' | 'image' | 'text'
  file_size integer not null default 0,
  -- Raw source — either the full text (for text-ish formats) or a preview.
  -- Kept nullable so huge files can opt out.
  raw_text text,
  -- Mapping used by this run: { columns: {...}, defaults: {...}, dedupe_decisions: {...} }
  mapping jsonb,
  -- Summary counts for the history page
  rows_total integer not null default 0,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  rows_duplicate integer not null default 0,
  warnings jsonb,                         -- array of strings
  status text not null default 'pending', -- 'pending' | 'committed' | 'failed' | 'undone'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.import_batches (user_id, created_at desc);
create index on public.import_batches (user_id, status);

alter table public.transactions
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
create index if not exists transactions_import_batch_idx on public.transactions (user_id, import_batch_id);

-- touch trigger
create trigger touch_import_batches
  before update on public.import_batches
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.import_batches enable row level security;
create policy "import_batches_self_select" on public.import_batches
  for select using (auth.uid() = user_id);
create policy "import_batches_self_insert" on public.import_batches
  for insert with check (auth.uid() = user_id);
create policy "import_batches_self_update" on public.import_batches
  for update using (auth.uid() = user_id);
create policy "import_batches_self_delete" on public.import_batches
  for delete using (auth.uid() = user_id);
