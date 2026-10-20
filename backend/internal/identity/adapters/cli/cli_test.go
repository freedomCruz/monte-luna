package cli_test

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cli"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

type commands struct {
	called, password, email, name string
	err                           error
	calls                         int
}

func (c *commands) Bootstrap(_ context.Context, email, name, password string) (domain.User, error) {
	c.calls++
	c.called = "create-owner"
	c.email = email
	c.name = name
	c.password = password
	return domain.User{}, c.err
}
func (c *commands) EmergencyPassword(_ context.Context, email, password string) error {
	c.calls++
	c.called = "reset-password"
	c.email = email
	c.password = password
	return c.err
}
func (c *commands) EmergencyTOTP(_ context.Context, email string) error {
	c.calls++
	c.called = "reset-totp"
	c.email = email
	return c.err
}
func TestAdminCommandsStdinOnly(t *testing.T) {
	for _, tc := range []struct {
		name            string
		args            []string
		input, password string
		err             error
		code, calls     int
		stdout, stderr  string
	}{
		{name: "bootstrap", args: []string{"create-owner", "--email", "a@example.test", "--name", "Admin"}, input: "fixture secret\n", password: "fixture secret", code: 0, calls: 1, stdout: "Administrator command completed.\n"},
		{name: "password reset CRLF preserves spaces", args: []string{"reset-password", "--email", "a@example.test"}, input: " fixture secret \r\n", password: " fixture secret ", code: 0, calls: 1, stdout: "Administrator command completed.\n"},
		{name: "TOTP reset", args: []string{"reset-totp", "--email", "a@example.test"}, code: 0, calls: 1, stdout: "Administrator command completed.\n"},
		{name: "help", args: []string{"--help"}, code: 0, stdout: cli.Usage},
		{name: "command help", args: []string{"create-owner", "--help"}, code: 0, stdout: cli.Usage},
		{name: "password argv forbidden", args: []string{"reset-password", "--email", "a@example.test", "--password", "fixture secret"}, code: 2, stderr: "Invalid command arguments.\n" + cli.Usage},
		{name: "positional secret forbidden", args: []string{"reset-password", "--email", "a@example.test", "fixture secret"}, code: 2, stderr: "Invalid command arguments.\n" + cli.Usage},
		{name: "missing name", args: []string{"create-owner", "--email", "a@example.test"}, code: 2, stderr: "Invalid command arguments.\n" + cli.Usage},
		{name: "multiple password lines", args: []string{"reset-password", "--email", "a@example.test"}, input: "fixture secret\nsecond\n", code: 2, stderr: "Unable to read a single password from stdin.\n"},
		{name: "oversized stdin", args: []string{"reset-password", "--email", "a@example.test"}, input: strings.Repeat("x", 100), code: 2, stderr: "Unable to read a single password from stdin.\n"},
		{name: "opaque error", args: []string{"reset-totp", "--email", "a@example.test"}, err: errors.New("fixture secret"), code: 1, calls: 1, stderr: "Administrator command failed.\n"},
		{name: "policy failure", args: []string{"reset-password", "--email", "a@example.test"}, input: "fixture secret", password: "fixture secret", err: domain.ErrValidation, code: 2, calls: 1, stderr: "Invalid administrator input.\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service := &commands{err: tc.err}
			runner, err := cli.New(service, cli.Config{MaxPasswordBytes: 64})
			if err != nil {
				t.Fatal(err)
			}
			var stdout, stderr bytes.Buffer
			code := runner.Run(t.Context(), tc.args, strings.NewReader(tc.input), &stdout, &stderr)
			if code != tc.code || stdout.String() != tc.stdout || stderr.String() != tc.stderr || service.calls != tc.calls || service.password != tc.password {
				t.Fatal("command effects, output or status differ from contract")
			}
			if strings.Contains(stdout.String()+stderr.String(), "fixture secret") {
				t.Fatal("secret leaked")
			}
		})
	}
	if _, err := cli.New(&commands{}, cli.Config{}); err == nil {
		t.Fatal("missing input bound accepted")
	}
}
