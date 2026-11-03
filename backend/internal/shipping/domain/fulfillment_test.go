package domain_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/shipping/domain"
)

const orderID = "01946894-3d9a-7c98-b807-6c84c1762c2f"

func TestDispatchValidation(t *testing.T) {
	for _, tt := range []struct {
		name   string
		change func(*domain.DispatchInput)
		field  string
	}{
		{"carrier required", func(in *domain.DispatchInput) { in.CarrierName = " \t" }, "carrier_name"},
		{"tracking https", func(in *domain.DispatchInput) { v := "http://carrier.example/123"; in.TrackingURL = &v }, "tracking_url"},
		{"tracking absolute", func(in *domain.DispatchInput) { v := "https:///missing-host"; in.TrackingURL = &v }, "tracking_url"},
		{"tracking blank", func(in *domain.DispatchInput) { v := ""; in.TrackingURL = &v }, "tracking_url"},
		{"shipment version positive", func(in *domain.DispatchInput) { v := int32(0); in.ShipmentVersion = &v }, "shipment_version"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			in := domain.DispatchInput{OrderID: orderID, ActorID: orderID, OrderVersion: 1, CarrierName: "Carrier"}
			tt.change(&in)
			before := in
			_, err := domain.NormalizeDispatch(in)
			var invalid *domain.ValidationError
			if !errors.As(err, &invalid) || invalid.Field != tt.field {
				t.Fatalf("error=%v", err)
			}
			if !reflect.DeepEqual(before, in) {
				t.Fatal("validation mutated caller input")
			}
		})
	}
	t.Run("normalize optional guide", func(t *testing.T) {
		blank := "  "
		in := domain.DispatchInput{OrderID: orderID, ActorID: orderID, OrderVersion: 1, CarrierName: " Carrier ", TrackingNumber: &blank}
		got, err := domain.NormalizeDispatch(in)
		if err != nil || got.CarrierName != "Carrier" || got.TrackingNumber != nil || got.TrackingURL != nil || got.ShipmentVersion != nil {
			t.Fatalf("got=%+v error=%v", got, err)
		}
	})
}
