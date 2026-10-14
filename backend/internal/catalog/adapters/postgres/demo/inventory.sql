-- Demo lot dates are fixed so oldest-available-lot behavior is reproducible.
INSERT INTO catalog.lots (product_id, lot_code, production_date, expiration_date, status)
SELECT p.id, d.lot_code, d.production_date, d.production_date + 365, 'active'
FROM (VALUES
  ('finca-el-mirador', 'DEMO-MIRADOR-OLD', DATE '2026-10-01'),
  ('finca-el-mirador', 'DEMO-MIRADOR-NEW', DATE '2026-10-08'),
  ('finca-la-maria', 'DEMO-MARIA', DATE '2026-10-03'),
  ('chocolate-70', 'DEMO-CHOCOLATE-70', DATE '2026-09-20'),
  ('chocolate-85', 'DEMO-CHOCOLATE-85', DATE '2026-09-22')
) AS d(slug, lot_code, production_date)
JOIN catalog.products p ON p.slug=d.slug
ON CONFLICT (product_id, lot_code) DO NOTHING;

-- Every newly initialized positive stock counter gets its receipt movement in
-- the same transaction. Existing counters are never replenished by this seed.
WITH inserted_stock AS (
  INSERT INTO catalog.variant_lot_stock (product_id, variant_id, lot_id, quantity)
  SELECT v.product_id, v.id, l.id, d.quantity
  FROM (VALUES
    ('MIRADOR-250-WHOLE_BEAN', 'DEMO-MIRADOR-OLD', 5),
    ('MIRADOR-250-WHOLE_BEAN', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-250-FINE', 'DEMO-MIRADOR-OLD', 0),
    ('MIRADOR-250-FINE', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-250-MEDIUM', 'DEMO-MIRADOR-OLD', 5),
    ('MIRADOR-250-MEDIUM', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-250-COARSE', 'DEMO-MIRADOR-OLD', 5),
    ('MIRADOR-250-COARSE', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-500-WHOLE_BEAN', 'DEMO-MIRADOR-OLD', 5),
    ('MIRADOR-500-WHOLE_BEAN', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-500-FINE', 'DEMO-MIRADOR-OLD', 5),
    ('MIRADOR-500-FINE', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-500-MEDIUM', 'DEMO-MIRADOR-OLD', 5),
    ('MIRADOR-500-MEDIUM', 'DEMO-MIRADOR-NEW', 7),
    ('MIRADOR-500-COARSE', 'DEMO-MIRADOR-OLD', 0),
    ('MIRADOR-500-COARSE', 'DEMO-MIRADOR-NEW', 0),
    ('MARIA-250-WHOLE_BEAN', 'DEMO-MARIA', 10),
    ('CHOCOLATE-70-80', 'DEMO-CHOCOLATE-70', 12),
    ('CHOCOLATE-85-80', 'DEMO-CHOCOLATE-85', 9)
  ) AS d(sku, lot_code, quantity)
  JOIN catalog.product_variants v ON v.sku=d.sku
  JOIN catalog.lots l ON l.product_id=v.product_id AND l.lot_code=d.lot_code
  ON CONFLICT (variant_id, lot_id) DO NOTHING
  RETURNING variant_id, lot_id, quantity
)
INSERT INTO catalog.inventory_movements (variant_id, lot_id, quantity_delta, reason, note)
SELECT variant_id, lot_id, quantity, 'receipt', 'Initial demo stock; not a production inventory receipt'
FROM inserted_stock WHERE quantity>0;

INSERT INTO catalog.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM (VALUES
  ('finca-el-mirador', 'coffee'), ('finca-la-maria', 'coffee'),
  ('chocolate-70', 'cacao'), ('chocolate-70', 'chocolate'),
  ('chocolate-85', 'cacao'), ('chocolate-85', 'chocolate')
) AS d(product_slug, category_slug)
JOIN catalog.products p ON p.slug=d.product_slug
JOIN catalog.categories c ON c.slug=d.category_slug
ON CONFLICT (product_id, category_id) DO NOTHING;

INSERT INTO catalog.product_images (product_id, storage_key, alt_text, position)
SELECT p.id, d.storage_key, d.alt_text, 0
FROM (VALUES
  ('finca-el-mirador', 'demo/products/finca-el-mirador.jpg', 'Demo Finca El Mirador coffee packaging'),
  ('finca-la-maria', 'demo/products/finca-la-maria.jpg', 'Demo Finca La María coffee packaging'),
  ('chocolate-70', 'demo/products/chocolate-70.jpg', 'Demo 70 percent cacao bar packaging'),
  ('chocolate-85', 'demo/products/chocolate-85.jpg', 'Demo 85 percent cacao bar packaging')
) AS d(slug, storage_key, alt_text)
JOIN catalog.products p ON p.slug=d.slug
WHERE NOT EXISTS (SELECT 1 FROM catalog.product_images i WHERE i.product_id=p.id AND i.storage_key=d.storage_key);
