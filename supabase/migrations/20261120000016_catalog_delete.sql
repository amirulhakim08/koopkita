-- =============================================================================
-- KoopKITA — "Bisnes Saya": members may delete catalogue items.
--
-- Catalogue items are only templates: picking one copies its name and price
-- into the document line, so nothing refers to a catalogue row and deleting it
-- never changes an issued invoice or receipt. Hiding stays available for items
-- that are sold only now and then.
-- =============================================================================

drop trigger trg_business_catalog_items_no_delete on public.business_catalog_items;

grant delete on public.business_catalog_items to authenticated;

create policy business_catalog_delete on public.business_catalog_items for delete to authenticated
  using ((select app_private.owns_business(business_id))
         and exists (select 1 from public.business_profiles b where b.id = business_id and b.suspended_at is null));
