-- AI usage tracking — one row per user per UTC day.
-- Lets us enforce a daily cap on LLM calls cheaply.
--
-- We increment `calls` and `input_tokens`/`output_tokens` on every AI
-- request. Rows older than 30 days can be garbage-collected if desired.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- Users can read their own usage (for the "tokens left today" UI).
create policy "ai_usage_self_select"
  on public.ai_usage for select
  using (auth.uid() = user_id);

-- Writes happen via service role in the API route, so no insert/update
-- policy is needed for clients. (RLS defaults deny.)

-- Atomic increment function — call from the API route after each AI call.
-- Returns the post-update row so the caller can decide to 429 the next call.
create or replace function public.ai_usage_increment(
  p_calls integer,
  p_in_tokens integer,
  p_out_tokens integer
)
returns public.ai_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_usage;
begin
  insert into public.ai_usage (user_id, day, calls, input_tokens, output_tokens)
  values (auth.uid(), (now() at time zone 'utc')::date, p_calls, p_in_tokens, p_out_tokens)
  on conflict (user_id, day) do update
    set calls = ai_usage.calls + excluded.calls,
        input_tokens = ai_usage.input_tokens + excluded.input_tokens,
        output_tokens = ai_usage.output_tokens + excluded.output_tokens,
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.ai_usage_increment(integer, integer, integer) to authenticated;
