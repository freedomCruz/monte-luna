-- name: RecordWebhook :execrows
INSERT INTO notifications.provider_webhook_events(provider,external_event_id,event_type,received_at)
VALUES('resend',$1,$2,$3) ON CONFLICT(provider,external_event_id) DO NOTHING;

-- name: LockMessageByProvider :one
SELECT * FROM notifications.email_messages WHERE provider='resend' AND provider_message_id=$1 FOR UPDATE;

-- name: UpdateWebhookStatus :exec
UPDATE notifications.email_messages SET status=$2,updated_at=$3 WHERE id=$1;
