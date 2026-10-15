-- +goose NO TRANSACTION
-- +goose Up
-- Release and allocation-reference guards read only reservation movements.
CREATE INDEX CONCURRENTLY inventory_movements_allocation_reference_idx
ON catalog.inventory_movements(reference_id,variant_id,lot_id)
WHERE reference_id IS NOT NULL AND reason IN ('sale','release');

-- +goose Down
DROP INDEX CONCURRENTLY catalog.inventory_movements_allocation_reference_idx;
