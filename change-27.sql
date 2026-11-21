-- 21 Nov 2026: a partner logging a MINT phone sees the commission straight away, without being able to read the price sheet.
-- Spread = price-sheet value - the phone's deductions - price paid; the commission is the band that spread falls in.
-- Returns only the commission (never the sheet value or the spread).
create or replace function mint_commission_preview(p_model text, p_storage int, p_paid_cents int, p_deductions_cents int default 0)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare ff int; spread int; fee int;
begin
  if not exists (select 1 from partners where id = auth.uid() and role in ('partner', 'owner')) then raise exception 'Not allowed'; end if;
  select ff_price_cents into ff from expected_prices where model = p_model and storage_gb = p_storage;
  if ff is null then return jsonb_build_object('known', false); end if;
  spread := ff - coalesce(p_deductions_cents, 0) - p_paid_cents;
  select fee_cents into fee from commission_bands where min_spread_cents is null or spread >= min_spread_cents order by coalesce(min_spread_cents, -2147483648) desc limit 1;
  return jsonb_build_object('known', fee is not null, 'commission_cents', fee);
end $$;
revoke execute on function mint_commission_preview(text, int, int, int) from public, anon;
grant execute on function mint_commission_preview(text, int, int, int) to authenticated;
