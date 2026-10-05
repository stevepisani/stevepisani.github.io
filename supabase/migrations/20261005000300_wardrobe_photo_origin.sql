-- Where each wardrobe photo came from, so Steve's own photos, a shop's pictures and the wardrobe's
-- own catalog images aren't confused (docs/apps.md, the wardrobe's photos):
--   own        a photo of Steve's piece (uploaded in a chat or the app): evidence of what he has
--   reference  a shop's or maker's picture (source_url says where): something to make a catalog
--              image from, shown only when there's nothing better
--   catalog    the wardrobe's own image of the garment, made in one style for every brand (front
--              on, plain light background, no model; made_from says which photos it came from):
--              the one shown when there is one
alter table public.wardrobe_photos
  add column if not exists origin text not null default 'own' check (origin in ('own', 'reference', 'catalog')),
  add column if not exists source_url text,
  add column if not exists made_from uuid[] not null default '{}';

-- What's already known: a shop's picture copied in, or one generated, says so in source
update public.wardrobe_photos set origin = 'reference' where origin = 'own' and source in ('retailer_page', 'manufacturer_page');
update public.wardrobe_photos set origin = 'catalog' where origin = 'own' and source = 'generated';
