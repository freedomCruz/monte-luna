-- +goose Up
-- Durable compensation tickets are inserted before object PUT and removed in
-- the same transaction as image attachment. Unfinished keys survive a crash.
CREATE TABLE catalog.media_uploads (
  id uuid PRIMARY KEY,
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE catalog.media_uploads;
