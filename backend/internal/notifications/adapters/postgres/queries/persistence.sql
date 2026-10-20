-- name: RecordIntake :exec
INSERT INTO notifications.processed_events(event_id,event_type,processed_at)
VALUES ($1,$2,$3) ON CONFLICT(event_id) DO NOTHING;

-- name: InsertMessage :exec
INSERT INTO notifications.email_messages(source_event_id,template_key,recipient_email,template_data,status,created_at,updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(source_event_id) DO NOTHING;

-- name: LockMessageBySource :one
SELECT * FROM notifications.email_messages WHERE source_event_id=$1 FOR UPDATE;

-- name: IsSuppressed :one
SELECT EXISTS(SELECT 1 FROM notifications.email_suppressions WHERE email=$1);

-- name: InsertSuppression :exec
INSERT INTO notifications.email_suppressions(email,reason,source_message_id,created_at)
VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING;

-- name: SuppressPending :one
UPDATE notifications.email_messages SET status='suppressed',updated_at=$2
WHERE id=$1 AND status IN ('pending','failed') RETURNING *;

-- name: DeleteProcessedEvents :exec
DELETE FROM notifications.processed_events WHERE event_id IN (
 SELECT e.event_id FROM notifications.processed_events e WHERE e.processed_at < $1
 ORDER BY e.processed_at,e.event_id LIMIT $2 FOR UPDATE SKIP LOCKED
);

-- name: DeleteProviderWebhookEvents :exec
DELETE FROM notifications.provider_webhook_events WHERE id IN (
 SELECT e.id FROM notifications.provider_webhook_events e WHERE e.received_at < $1
 ORDER BY e.received_at,e.id LIMIT $2 FOR UPDATE SKIP LOCKED
);

-- name: ClearTemplateData :exec
UPDATE notifications.email_messages SET template_data='{}',updated_at=sqlc.arg(now_at)
WHERE id IN (
 SELECT m.id FROM notifications.email_messages m WHERE m.created_at < sqlc.arg(cutoff)
 AND m.template_data <> '{}'::jsonb ORDER BY m.created_at,m.id LIMIT sqlc.arg(batch_size)
 FOR UPDATE SKIP LOCKED
);

-- name: AnonymizeRecipients :exec
UPDATE notifications.email_messages SET recipient_email=NULL,updated_at=sqlc.arg(now_at)
WHERE id IN (
 SELECT m.id FROM notifications.email_messages m WHERE m.created_at < sqlc.arg(cutoff)
 AND m.recipient_email IS NOT NULL ORDER BY m.created_at,m.id LIMIT sqlc.arg(batch_size)
 FOR UPDATE SKIP LOCKED
);
