package ratelimit_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/ratelimit"
)

func TestBothDimensionsAndRefill(t *testing.T) {
	now := time.Unix(1800000000, 0)
	for _, tc := range []struct{ name, account, ip string }{{"account across IPs", " ADMIN@example.test ", "127.0.0.2"}, {"IP across accounts", "other@example.test", "127.0.0.1"}} {
		t.Run(tc.name, func(t *testing.T) {
			l, err := ratelimit.New(ratelimit.Config{AccountPerSecond: 1, IPPerSecond: 1, AccountBurst: 1, IPBurst: 1, MaxKeys: 20, IdleTTL: time.Minute})
			if err != nil {
				t.Fatal(err)
			}
			if d, err := l.Allow(t.Context(), "admin@example.test", "127.0.0.1", now); err != nil || d != 0 {
				t.Fatal("initial request denied")
			}
			if d, err := l.Allow(t.Context(), tc.account, tc.ip, now); err != nil || d <= 0 {
				t.Fatal("dimension bypassed")
			}
			if d, err := l.Allow(t.Context(), tc.account, tc.ip, now.Add(time.Second)); err != nil || d != 0 {
				t.Fatal("refill failed")
			}
		})
	}
}
func TestCapacityCancellationAndConcurrency(t *testing.T) {
	cfg := ratelimit.Config{AccountPerSecond: 1, IPPerSecond: 1, AccountBurst: 1, IPBurst: 1, MaxKeys: 2, IdleTTL: time.Minute}
	l, err := ratelimit.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1800000000, 0)
	if _, err := l.Allow(t.Context(), "a", "not-an-ip", now); err == nil {
		t.Fatal("invalid IP accepted")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := l.Allow(ctx, "a", "127.0.0.1", now); err == nil {
		t.Fatal("cancellation ignored")
	}
	if d, err := l.Allow(t.Context(), "a", "127.0.0.1", now); err != nil || d != 0 {
		t.Fatal("initial request denied")
	}
	if d, err := l.Allow(t.Context(), "b", "127.0.0.2", now); err != nil || d <= 0 {
		t.Fatal("capacity bypassed")
	}
	if d, err := l.Allow(t.Context(), "b", "127.0.0.2", now.Add(time.Minute)); err != nil || d != 0 {
		t.Fatal("idle capacity not reclaimed")
	}
	l, err = ratelimit.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			d, err := l.Allow(t.Context(), "a", "127.0.0.1", now)
			if err != nil {
				t.Error(err)
			} else if d == 0 {
				accepted.Add(1)
			}
		})
	}
	wg.Wait()
	if accepted.Load() != 1 {
		t.Fatal("concurrent limiter bypass")
	}
	cfg.IdleTTL = time.Nanosecond
	if _, err := ratelimit.New(cfg); err == nil {
		t.Fatal("unsafe expiry accepted")
	}
	if _, err := ratelimit.New(ratelimit.Config{}); err == nil {
		t.Fatal("missing config accepted")
	}
}
