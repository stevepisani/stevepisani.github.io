-- The wardrobe's first three garments, from the first test with ChatGPT (4 Oct 2026): one Uniqlo
-- shirt in three colours, added as three unrelated items with the tag's facts in their notes.
-- Regrouped as one product, three variants and the same three owned items (same ids). What each
-- item said before is kept, word for word, in sources.migrated_from. Nothing here runs anywhere
-- those items don't exist.
do $$
declare
  o uuid;
  p uuid;
  v uuid;
  r record;
  tag jsonb := '{"source": "hang_tag", "confidence": 1}';
begin
  select owner into o from public.wardrobe_items where id = 'a2f51ba0-6d53-4ab9-8e14-0975d338b22d';
  if o is null then return; end if;

  select id into p from public.wardrobe_products
    where owner = o and lower(brand) = 'uniqlo' and upper(style_number) = 'HT00189AD-US';
  if p is null then
    insert into public.wardrobe_products (owner, brand, name, style_number, material, country_of_origin, default_fit, identifiers, sources)
    values (o, 'Uniqlo', 'Soft Brushed Crew Neck Long Sleeve T', 'HT00189AD-US', '100% cotton', 'Vietnam', 'regular',
      -- on the tag beside the style number; kept as printed, not taken for a kind of code
      '{"tag_codes": ["RN139864"]}',
      jsonb_build_object('brand', tag, 'name', tag, 'style_number', tag, 'material', tag, 'country_of_origin', tag,
        'identifiers', tag || '{"raw": "RN139864 / HT00189AD-US"}',
        'default_fit', '{"source": "derived", "confidence": 0.7}'))
    returning id into p;
  end if;

  for r in select * from (values
      ('a2f51ba0-6d53-4ab9-8e14-0975d338b22d'::uuid, '38 Dark Brown', 'dark brown'),
      ('7e457d30-877c-4c2a-97ac-36b02abfeffd'::uuid, '08 Dark Gray', 'dark gray'),
      ('240e0d92-7fe5-4433-8bbf-3af32519224b'::uuid, '34 Brown', 'brown')) as t(id, made_colour, plain_colour)
  loop
    continue when not exists (select 1 from public.wardrobe_items i where i.id = r.id and i.owner = o and i.variant_id is null);
    select id into v from public.wardrobe_variants where product_id = p and lower(manufacturer_colour) = lower(r.made_colour) and upper(manufacturer_size) = 'M';
    if v is null then
      insert into public.wardrobe_variants (owner, product_id, manufacturer_colour, colour, manufacturer_size, size, price, currency, measurements, sources)
      values (o, p, r.made_colour, r.plain_colour, 'M', 'M', 29.90, 'USD', '{"chest": "38–41 in"}',
        jsonb_build_object('manufacturer_colour', tag, 'manufacturer_size', tag, 'price', tag, 'currency', tag,
          'measurements', tag || '{"raw": "Chest 38-41 in"}', 'colour', '{"source": "derived", "confidence": 1}', 'size', '{"source": "derived", "confidence": 1}'))
      returning id into v;
    end if;
    update public.wardrobe_items i set
      variant_id = v,
      subcategory = coalesce(i.subcategory, 'long_sleeve_t_shirt'),
      -- what the product and variant now say; the item keeps only what's its own
      name = null, brand = null, colour = null, size = null, material = null, fit = null,
      price = null, -- the tag's price is the retail price (on the variant); what Steve paid isn't known
      notes = nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(i.notes, ''),
        'Soft Brushed Crew Neck Long Sleeve T\.?', '', 'gi'),
        'Product code[^.]*\.?', '', 'gi'),
        'Chest[^.]*\.?', '', 'gi'),
        '\s+', ' ', 'g')), ''),
      sources = i.sources
        || jsonb_strip_nulls(jsonb_build_object(
             'warmth', case when i.warmth is not null then '{"source": "vision_inference", "confidence": 0.8}'::jsonb end,
             'dressiness', case when i.dressiness is not null then '{"source": "vision_inference", "confidence": 0.8}'::jsonb end,
             'seasons', case when cardinality(i.seasons) > 0 then '{"source": "derived", "confidence": 0.8}'::jsonb end))
        || jsonb_build_object('migrated_from', jsonb_strip_nulls(jsonb_build_object(
             'name', i.name, 'brand', i.brand, 'colour', i.colour, 'size', i.size, 'material', i.material,
             'fit', i.fit, 'price', i.price, 'currency', i.currency, 'notes', i.notes, 'at', '2026-10-05')))
    where i.id = r.id;
  end loop;
end $$;
