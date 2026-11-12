create or replace function public.reject_invalid_product_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is null
    or btrim(new.name) = ''
    or btrim(new.name) ~ '^[[:space:]?�□■▯◻◼]+$'
  then
    raise exception 'Product name must not be empty or contain only placeholder characters.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists products_validate_name on public.products;

create trigger products_validate_name
before insert or update of name on public.products
for each row
execute function public.reject_invalid_product_name();
