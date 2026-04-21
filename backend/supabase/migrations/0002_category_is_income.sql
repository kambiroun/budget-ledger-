-- Add is_income flag to categories so we can distinguish spending buckets from
-- income buckets (e.g. "Salary", "Freelance"). Required by the demo loader and
-- the Rules / Budgets / Stress-test views that filter on !is_income.

alter table public.categories
  add column if not exists is_income boolean not null default false;

-- Fast lookup for the "is there an income category yet?" check in demo loader
create index if not exists categories_user_income_idx
  on public.categories (user_id, is_income)
  where deleted_at is null;
