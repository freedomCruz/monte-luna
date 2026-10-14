-- Fictional development fixtures, not migrations and never production seed data.
INSERT INTO catalog.product_types (name, slug) VALUES
  ('Café', 'coffee'), ('Cacao', 'cacao')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO catalog.brands (name, slug, description, logo_storage_key, website_url, status)
VALUES ('Monteluna', 'monteluna', 'Marca comercial demo', 'demo/brands/monteluna.png', NULL, 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO catalog.origins
  (name, slug, producer_name, country_code, department, municipality_code,
   municipality_name, altitude_min_masl, altitude_max_masl, story, status)
VALUES
  ('Finca El Mirador', 'finca-el-mirador', 'Productor de café demo', 'CO', 'Huila', '41668',
   'San Agustín', 1700, 1900, '[Historia demo] Finca cafetera ficticia utilizada para demostrar datos de origen reutilizables.', 'active'),
  ('[Origen de cacao demo]', 'demo-cacao-origin', 'Productor de cacao demo', 'CO', 'Santander', '68689',
   'San Vicente de Chucurí', 400, 700, '[Historia demo] Unidad productora de cacao ficticia; el comerciante debe reemplazar estos datos.', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO catalog.origin_images (origin_id, storage_key, alt_text, position)
SELECT o.id, d.storage_key, d.alt_text, 0
FROM (VALUES
  ('finca-el-mirador', 'demo/origins/finca-el-mirador.jpg', 'Paisaje de finca cafetera demo'),
  ('demo-cacao-origin', 'demo/origins/cacao.jpg', 'Paisaje de finca cacaotera demo')
) AS d(slug, storage_key, alt_text)
JOIN catalog.origins o ON o.slug=d.slug
WHERE NOT EXISTS (SELECT 1 FROM catalog.origin_images i WHERE i.origin_id=o.id AND i.storage_key=d.storage_key);

INSERT INTO catalog.categories (name, slug, position, status) VALUES
  ('Café', 'coffee', 0, 'active'), ('Cacao', 'cacao', 1, 'active')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO catalog.categories (parent_id, name, slug, position, status)
SELECT id, 'Chocolate', 'chocolate', 2, 'active' FROM catalog.categories WHERE slug='cacao'
ON CONFLICT (slug) DO NOTHING;
