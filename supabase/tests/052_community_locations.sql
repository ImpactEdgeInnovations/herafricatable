-- Test only: this always rolls back. Run after the location migration.
begin;
do $$
declare rejected boolean := false;
begin
  if public.validate_community_location('place','  Lavington,   Nairobi ') <> 'Lavington, Nairobi' then
    raise exception 'Place normalization failed';
  end if;
  if public.validate_community_location('global','Ignored') is not null then
    raise exception 'Global location must not contain a place';
  end if;
  begin
    perform public.validate_community_location('place','');
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Blank specific place was accepted'; end if;
  if has_function_privilege('anon','public.list_community_locations()','execute') then
    raise exception 'Anonymous location lookup must not be allowed';
  end if;
  if has_function_privilege('anon','public.save_community_location(uuid,text,text)','execute') then
    raise exception 'Anonymous location update must not be allowed';
  end if;
end;
$$;
-- Real owner/member save and visibility checks remain part of multi-account acceptance.
rollback;
