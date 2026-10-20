// Package cli provides injectable administrator command execution. I1 wires
// the executable and environment. No CLI operation is exposed through HTTP.
package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
)

const Usage = `Usage:
  admin create-owner --email <email> --name <display-name>
  admin reset-password --email <email>
  admin reset-totp --email <email>

Passwords are read exclusively from stdin (one line), never arguments or logs.
Use a protected pipe or redirected input; interactive input is not echo-hidden.
create-owner is allowed only for an empty administrator database.
reset-password revokes existing sessions; mandatory TOTP remains enabled.
reset-totp revokes sessions and requires fresh enrollment at the next login.
Operational commands are audited; help does not access the database.
`

type Commands interface {
	Bootstrap(context.Context, string, string, string) (domain.User, error)
	EmergencyPassword(context.Context, string, string) error
	EmergencyTOTP(context.Context, string) error
}
type Config struct{ MaxPasswordBytes int }
type Runner struct {
	service Commands
	config  Config
}

func New(service Commands, config Config) (*Runner, error) {
	if service == nil || config.MaxPasswordBytes < 1 || config.MaxPasswordBytes > 1048576 {
		return nil, domain.ErrValidation
	}
	return &Runner{service, config}, nil
}
func write(w io.Writer, message string) bool { _, err := io.WriteString(w, message); return err == nil }
func (r *Runner) usageError(stderr io.Writer) int {
	write(stderr, "Invalid command arguments.\n"+Usage)
	return 2
}
func (r *Runner) Run(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if stdout == nil || stderr == nil {
		return 1
	}
	if len(args) == 1 && (args[0] == "--help" || args[0] == "-h") {
		if !write(stdout, Usage) {
			return 1
		}
		return 0
	}
	if len(args) == 0 {
		return r.usageError(stderr)
	}
	command := args[0]
	if command != "create-owner" && command != "reset-password" && command != "reset-totp" {
		return r.usageError(stderr)
	}
	flags := flag.NewFlagSet("admin", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var email, name string
	flags.StringVar(&email, "email", "", "")
	if command == "create-owner" {
		flags.StringVar(&name, "name", "", "")
	}
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			if !write(stdout, Usage) {
				return 1
			}
			return 0
		}
		return r.usageError(stderr)
	}
	if flags.NArg() != 0 || email == "" || (command == "create-owner" && name == "") {
		return r.usageError(stderr)
	}
	var password string
	if command != "reset-totp" {
		if stdin == nil {
			write(stderr, "Unable to read a single password from stdin.\n")
			return 2
		}
		data, err := io.ReadAll(io.LimitReader(stdin, int64(r.config.MaxPasswordBytes)+3))
		input := strings.TrimSuffix(strings.TrimSuffix(string(data), "\n"), "\r")
		if err != nil || len(input) > r.config.MaxPasswordBytes || strings.ContainsAny(input, "\r\n") {
			write(stderr, "Unable to read a single password from stdin.\n")
			return 2
		}
		password = input
	}
	var err error
	switch command {
	case "create-owner":
		_, err = r.service.Bootstrap(ctx, email, name, password)
	case "reset-password":
		err = r.service.EmergencyPassword(ctx, email, password)
	case "reset-totp":
		err = r.service.EmergencyTOTP(ctx, email)
	}
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrValidation):
			write(stderr, "Invalid administrator input.\n")
			return 2
		case errors.Is(err, domain.ErrNotFound):
			write(stderr, "Administrator not found.\n")
		case errors.Is(err, domain.ErrBootstrapComplete):
			write(stderr, "Initial owner already exists.\n")
		default:
			write(stderr, "Administrator command failed.\n")
		}
		return 1
	}
	if _, err := fmt.Fprintln(stdout, "Administrator command completed."); err != nil {
		return 1
	}
	return 0
}
