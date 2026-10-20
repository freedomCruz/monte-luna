// Package ratelimit implements bounded, process-local account and IP buckets.
package ratelimit

import (
	"context"
	"crypto/sha256"
	"math"
	"net/netip"
	"strings"
	"sync"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"golang.org/x/time/rate"
)

type Config struct {
	AccountPerSecond float64
	IPPerSecond      float64
	AccountBurst     int
	IPBurst          int
	MaxKeys          int
	IdleTTL          time.Duration
}
type bucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}
type Limiter struct {
	mu          sync.Mutex
	config      Config
	buckets     map[[32]byte]*bucket
	lastCleanup time.Time
}

var _ domain.AuthLimiter = (*Limiter)(nil)

func New(c Config) (*Limiter, error) {
	if c.AccountPerSecond <= 0 || c.IPPerSecond <= 0 || math.IsNaN(c.AccountPerSecond) || math.IsNaN(c.IPPerSecond) || math.IsInf(c.AccountPerSecond, 0) || math.IsInf(c.IPPerSecond, 0) || c.AccountBurst < 1 || c.IPBurst < 1 || c.MaxKeys < 2 || c.MaxKeys > 100000 || c.IdleTTL <= 0 {
		return nil, domain.ErrValidation
	}
	// Evict only after both buckets could have completely refilled naturally.
	refill := math.Max(float64(c.AccountBurst)/c.AccountPerSecond, float64(c.IPBurst)/c.IPPerSecond)
	if float64(c.IdleTTL)/float64(time.Second) < refill {
		return nil, domain.ErrValidation
	}
	return &Limiter{config: c, buckets: make(map[[32]byte]*bucket)}, nil
}
func (l *Limiter) Allow(ctx context.Context, account, ip string, now time.Time) (time.Duration, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	account = strings.ToLower(strings.TrimSpace(account))
	address, err := netip.ParseAddr(ip)
	if account == "" || err != nil {
		return 0, domain.ErrValidation
	}
	keys := [2][32]byte{sha256.Sum256([]byte("account:" + account)), sha256.Sum256([]byte("ip:" + address.Unmap().String()))}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.lastCleanup.IsZero() || now.Sub(l.lastCleanup) >= l.config.IdleTTL {
		for key, b := range l.buckets {
			if now.Sub(b.lastSeen) >= l.config.IdleTTL {
				delete(l.buckets, key)
			}
		}
		l.lastCleanup = now
	}
	missing := 0
	for _, key := range keys {
		if l.buckets[key] == nil {
			missing++
		}
	}
	if len(l.buckets)+missing > l.config.MaxKeys {
		return l.config.IdleTTL, nil
	}
	rates := [2]float64{l.config.AccountPerSecond, l.config.IPPerSecond}
	bursts := [2]int{l.config.AccountBurst, l.config.IPBurst}
	var delay time.Duration
	for i, key := range keys {
		b := l.buckets[key]
		if b == nil {
			b = &bucket{limiter: rate.NewLimiter(rate.Limit(rates[i]), bursts[i])}
			l.buckets[key] = b
		}
		b.lastSeen = now
		tokens := b.limiter.TokensAt(now)
		if tokens < 1 {
			seconds := (1 - tokens) / rates[i]
			wait := time.Duration(math.Ceil(seconds * float64(time.Second)))
			if wait < time.Nanosecond {
				wait = time.Nanosecond
			}
			if wait > delay {
				delay = wait
			}
		}
	}
	if delay > 0 {
		return delay, nil
	}
	for _, key := range keys {
		l.buckets[key].limiter.AllowN(now, 1)
	}
	return 0, nil
}
