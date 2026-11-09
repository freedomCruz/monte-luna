package postgres

import (
	"context"
	"errors"
)

// AdminNames preserves disabled administrators for historical attribution and
// returns only current display names, never credentials or session information.
func (r *Repository) AdminNames(ctx context.Context, ids []string) (map[string]string, error) {
	out := map[string]string{}
	if len(ids) == 0 {
		return out, nil
	}
	if len(ids) > 100 {
		return nil, errors.New("identity name batch exceeds 100")
	}
	rows, err := r.pool.Query(ctx, `SELECT id::text,display_name FROM identity.admin_users WHERE id=ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}
