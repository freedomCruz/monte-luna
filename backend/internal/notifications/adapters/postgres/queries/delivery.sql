-- name: RecordSent :exec
UPDATE notifications.email_messages
SET status='sent',provider=$2,provider_message_id=$3,attempts=attempts+1,
    last_error=NULL,sent_at=$4,updated_at=$4
WHERE id=$1 AND status IN ('pending','failed');

-- name: RecordFailure :exec
UPDATE notifications.email_messages
SET status='failed',attempts=attempts+1,last_error='notification delivery failed',updated_at=$2
WHERE id=$1 AND status IN ('pending','failed');
