-- +goose Up
-- +goose StatementBegin
CREATE FUNCTION identity.preserve_security_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Preserve the canonical ON DELETE SET NULL actor-FK exception. The v1
    -- API never deletes administrators, but historical records must survive it.
    IF NEW.admin_user_id IS NULL AND OLD.admin_user_id IS NOT NULL
       AND (to_jsonb(NEW) - 'admin_user_id') = (to_jsonb(OLD) - 'admin_user_id') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'security events are immutable' USING ERRCODE = '23514';
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER identity_security_events_immutable
BEFORE UPDATE ON identity.security_events
FOR EACH ROW EXECUTE FUNCTION identity.preserve_security_event();

-- +goose Down
DROP TRIGGER identity_security_events_immutable ON identity.security_events;
DROP FUNCTION identity.preserve_security_event();
