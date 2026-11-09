package domain

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"time"
)

type adminReadCursor struct {
	Binding string `json:"b"`
	ID      string `json:"i"`
	Text    string `json:"t"`
	Number  *int64 `json:"n"`
}

func AdminReadCursor(f AdminReadFilter, id, text string, number *int64) string {
	data, _ := json.Marshal(adminReadCursor{f.Binding, id, text, number})
	return base64.RawURLEncoding.EncodeToString(data)
}
func ParseAdminReadFilter(kind, id string, values map[string][]string) (AdminReadFilter, error) {
	f := AdminReadFilter{Kind: kind, ID: strings.ToLower(id), Limit: 25, Sort: "title", Stock: "all"}
	bad := &Error{Status: 400, Code: "bad_request"}
	invalid := &Error{Status: 422, Code: "validation_failed"}
	if id != "" && !ValidAdminID(id) {
		return f, bad
	}
	allowed := map[string]bool{}
	if kind != "product" && kind != "variant" && kind != "inventory-detail" {
		allowed["limit"] = true
		allowed["cursor"] = true
	}
	switch kind {
	case "products":
		for _, k := range []string{"search", "category_id", "product_type_id", "status", "stock", "sort"} {
			allowed[k] = true
		}
	case "inventory":
		for _, k := range []string{"search", "product_id", "status", "stock"} {
			allowed[k] = true
		}
		f.Status = "all"
	case "categories", "brands":
		allowed["status"] = true
		f.Status = "active"
	case "origins":
		allowed["search"] = true
		allowed["status"] = true
		f.Status = "active"
	case "movements":
		allowed["lot_id"] = true
	}
	for k, v := range values {
		if !allowed[k] || len(v) == 0 {
			return f, invalid
		}
		multi := kind == "products" && (k == "category_id" || k == "product_type_id" || k == "status")
		if !multi && len(v) != 1 {
			return f, invalid
		}
		if multi {
			seen := map[string]bool{}
			for _, value := range v {
				if seen[value] {
					return f, invalid
				}
				seen[value] = true
			}
			sort.Strings(v)
		}
		switch k {
		case "limit":
			n, err := strconv.Atoi(v[0])
			if err != nil || (n != 25 && n != 50 && n != 100) {
				return f, invalid
			}
			f.Limit = n
		case "search":
			f.Search = strings.TrimSpace(v[0])
		case "stock":
			if v[0] != "all" && v[0] != "low_or_empty" {
				return f, invalid
			}
			f.Stock = v[0]
		case "sort":
			switch v[0] {
			case "title", "-title", "price_amount", "-price_amount", "stock", "-stock":
				f.Sort = v[0]
			default:
				return f, invalid
			}
		case "status":
			if kind == "products" {
				for _, s := range v {
					if s != "draft" && s != "published" && s != "archived" {
						return f, invalid
					}
				}
				f.Statuses = append([]string{}, v...)
			} else {
				if v[0] != "active" && v[0] != "archived" && v[0] != "all" {
					return f, invalid
				}
				f.Status = v[0]
			}
		case "category_id", "product_type_id":
			for _, s := range v {
				if !ValidAdminID(s) {
					return f, invalid
				}
			}
			if k == "category_id" {
				f.Categories = append([]string{}, v...)
			} else {
				f.ProductTypes = append([]string{}, v...)
			}
		case "product_id", "lot_id":
			if !ValidAdminID(v[0]) {
				return f, invalid
			}
			if k == "product_id" {
				f.ProductID = strings.ToLower(v[0])
			} else {
				f.LotID = strings.ToLower(v[0])
			}
		}
	}
	binding, _ := json.Marshal(f)
	hash := sha256.Sum256(binding)
	f.Binding = hex.EncodeToString(hash[:])
	if v, ok := values["cursor"]; ok {
		if len(v[0]) > 4096 {
			return f, bad
		}
		data, err := base64.RawURLEncoding.DecodeString(v[0])
		if err != nil {
			return f, bad
		}
		var c adminReadCursor
		if json.Unmarshal(data, &c) != nil || c.Binding != f.Binding || !ValidAdminID(c.ID) {
			return f, bad
		}
		switch kind {
		case "products":
			if strings.TrimPrefix(f.Sort, "-") == "stock" && (c.Number == nil || *c.Number < 0) {
				return f, bad
			}
			if strings.TrimPrefix(f.Sort, "-") == "price_amount" && c.Number != nil && *c.Number < 1 {
				return f, bad
			}
		case "categories", "inventory":
			if c.Number == nil || *c.Number < -2147483648 || *c.Number > 2147483647 {
				return f, bad
			}
		case "lots":
			if _, err := time.Parse("2006-01-02", c.Text); err != nil {
				return f, bad
			}
		case "movements":
			if _, err := time.Parse(time.RFC3339Nano, c.Text); err != nil {
				return f, bad
			}
		}
		f.AnchorID = c.ID
		f.AnchorText = c.Text
		f.AnchorNumber = c.Number
	}
	return f, nil
}
