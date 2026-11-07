package postgres

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
)

// receiveAdminLot runs only inside WriteAdmin's parent-locked transaction.
// It never trusts a client lot/product/actor identifier or stock total.
func receiveAdminLot(ctx context.Context, tx pgx.Tx, in domain.AdminWrite) (domain.AdminWriteResult, error) {
	var out domain.AdminWriteResult
	var input domain.AdminReceiveLot
	if err := decodeFields(in.Fields, &input); err != nil {
		return out, err
	}
	if err := input.Validate(); err != nil {
		return out, err
	}
	receipt := domain.AdminLotReceipt{ProductID: in.ProductID, ProductVersion: in.Version + 1, VariantID: in.VariantID, LotCode: input.LotCode, Reason: "receipt", QuantityReceived: input.Quantity}
	var production, status string
	var expiry *string
	var version int32
	err := tx.QueryRow(ctx, `SELECT id::text,production_date::text,expiration_date::text,status,version FROM catalog.lots WHERE product_id=$1 AND lot_code=$2 FOR UPDATE`, in.ProductID, input.LotCode).Scan(&receipt.LotID, &production, &expiry, &status, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		receipt.LotCreated = true
		err = tx.QueryRow(ctx, `INSERT INTO catalog.lots(product_id,lot_code,production_date,expiration_date,attributes,status) VALUES($1,$2,$3::date,$4::date,'{}','active') RETURNING id::text`, in.ProductID, input.LotCode, input.ProductionDate, input.ExpirationDate).Scan(&receipt.LotID)
	} else if err == nil {
		sameExpiry := expiry == nil && input.ExpirationDate == nil || expiry != nil && input.ExpirationDate != nil && *expiry == *input.ExpirationDate
		if production != input.ProductionDate || !sameExpiry || status == "archived" {
			return out, &domain.Error{Status: 409, Code: "lot_conflict"}
		}
		if status == "depleted" {
			tag, e := tx.Exec(ctx, `UPDATE catalog.lots SET status='active',version=version+1,updated_at=now() WHERE id=$1 AND version=$2`, receipt.LotID, version)
			if e != nil {
				return out, e
			}
			if tag.RowsAffected() != 1 {
				return out, &domain.Error{Status: 412, Code: "version_conflict"}
			}
		}
	}
	if err != nil {
		return out, err
	}
	// ON CONFLICT locks the current counter and computes against its latest value,
	// so order allocations/releases cannot be lost. The WHERE prevents overflow.
	err = tx.QueryRow(ctx, `INSERT INTO catalog.variant_lot_stock(product_id,variant_id,lot_id,quantity) VALUES($1,$2,$3,$4)
 ON CONFLICT(variant_id,lot_id) DO UPDATE SET quantity=catalog.variant_lot_stock.quantity+EXCLUDED.quantity,updated_at=now()
 WHERE catalog.variant_lot_stock.quantity<=2147483647-EXCLUDED.quantity RETURNING quantity`, in.ProductID, in.VariantID, receipt.LotID, input.Quantity).Scan(&receipt.QuantityAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, domain.AdminInvalid("quantity")
	}
	if err != nil {
		return out, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO catalog.inventory_movements(variant_id,lot_id,quantity_delta,reason,actor_id,reference_id,note) VALUES($1,$2,$3,'receipt',$4,NULL,$5) RETURNING id::text`, in.VariantID, receipt.LotID, input.Quantity, in.ActorID, input.Note).Scan(&receipt.MovementID)
	if err != nil {
		return out, err
	}
	out.Receipt = &receipt
	return out, nil
}
