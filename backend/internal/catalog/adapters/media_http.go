package adapters

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
)

type ImageUseCases interface {
	Upload(context.Context, domain.ImageUpload) (domain.AdminImage, error)
	Image(context.Context, string, string) (domain.AdminImage, error)
}
type MediaHTTP struct {
	service ImageUseCases
	access  identity.AccessChecker
}

func NewMediaHTTP(service ImageUseCases, access identity.AccessChecker) (*MediaHTTP, error) {
	if service == nil || access == nil {
		return nil, errors.New("admin media dependencies are required")
	}
	return &MediaHTTP{service: service, access: access}, nil
}
func (h *MediaHTTP) RegisterRoutes(mux *http.ServeMux, sessions func(http.Handler) http.Handler) {
	origin := http.NewCrossOriginProtection()
	origin.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mediaProblem(w, &domain.Error{Status: 403, Code: "cross_origin_rejected"})
	}))
	const base = "/api/v1/admin/products/{id}/images"
	mux.Handle("POST "+base, mediaNoStore(origin.Handler(sessions(http.HandlerFunc(h.upload)))))
	mux.Handle("GET "+base+"/{image_id}", mediaNoStore(sessions(http.HandlerFunc(h.image))))
}
func (h *MediaHTTP) authorize(w http.ResponseWriter, r *http.Request) bool {
	actor, err := h.access.Require(r.Context(), "catalog")
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrAuthenticationRequired):
			mediaProblem(w, &domain.Error{Status: 401, Code: "authentication_required"})
		case errors.Is(err, identity.ErrForbidden):
			mediaProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		default:
			mediaProblem(w, err)
		}
		return false
	}
	if actor.Role != "owner" && actor.Role != "staff" {
		mediaProblem(w, &domain.Error{Status: 403, Code: "forbidden"})
		return false
	}
	if !domain.ValidAdminID(r.PathValue("id")) {
		mediaProblem(w, &domain.Error{Status: 400, Code: "bad_request"})
		return false
	}
	if r.URL.RawQuery != "" {
		if _, err := url.ParseQuery(r.URL.RawQuery); err != nil {
			mediaProblem(w, &domain.Error{Status: 400, Code: "bad_request"})
			return false
		}
		mediaProblem(w, &domain.Error{Status: 422, Code: "validation_failed"})
		return false
	}
	return true
}
func productMatch(r *http.Request) (int32, error) {
	values := r.Header.Values("If-Match")
	if len(values) == 0 {
		return 0, &domain.Error{Status: 428, Code: "precondition_required"}
	}
	invalid := &domain.Error{Status: 400, Code: "bad_request"}
	if len(values) != 1 {
		return 0, invalid
	}
	value := values[0]
	if len(value) < 3 || value[0] != '"' || value[len(value)-1] != '"' || value[1] < '1' || value[1] > '9' {
		return 0, invalid
	}
	for _, c := range value[1 : len(value)-1] {
		if c < '0' || c > '9' {
			return 0, invalid
		}
	}
	version, err := strconv.ParseInt(value[1:len(value)-1], 10, 32)
	if err != nil {
		return 0, invalid
	}
	return int32(version), nil
}
func (h *MediaHTTP) upload(w http.ResponseWriter, r *http.Request) {
	if !h.authorize(w, r) {
		return
	}
	version, err := productMatch(r)
	if err != nil {
		mediaProblem(w, err)
		return
	}
	in, err := imageMultipart(w, r)
	if err != nil {
		mediaProblem(w, err)
		return
	}
	in.ProductID = r.PathValue("id")
	in.ProductVersion = version
	image, err := h.service.Upload(r.Context(), in)
	if err != nil {
		mediaProblem(w, err)
		return
	}
	w.Header().Set("Location", "/api/v1/admin/products/"+image.ProductID+"/images/"+image.ID)
	mediaJSON(w, http.StatusCreated, image)
}
func (h *MediaHTTP) image(w http.ResponseWriter, r *http.Request) {
	if !h.authorize(w, r) {
		return
	}
	id := r.PathValue("image_id")
	if !domain.ValidAdminID(id) {
		mediaProblem(w, &domain.Error{Status: 400, Code: "bad_request"})
		return
	}
	image, err := h.service.Image(r.Context(), r.PathValue("id"), id)
	if err != nil {
		mediaProblem(w, err)
		return
	}
	mediaJSON(w, http.StatusOK, image)
}
func imageMultipart(w http.ResponseWriter, r *http.Request) (domain.ImageUpload, error) {
	var in domain.ImageUpload
	bad := &domain.Error{Status: 400, Code: "bad_request"}
	invalid := &domain.Error{Status: 422, Code: "validation_failed"}
	if kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || kind != "multipart/form-data" {
		return in, bad
	}
	if r.ContentLength > 6<<20 {
		return in, &domain.Error{Status: 413, Code: "image_too_large"}
	}
	r.Body = http.MaxBytesReader(w, r.Body, 6<<20)
	reader, err := r.MultipartReader()
	if err != nil {
		return in, bad
	}
	seen := map[string]bool{}
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return in, multipartError(err)
		}
		name := part.FormName()
		if seen[name] || name != "file" && name != "alt_text" && name != "variant_id" && name != "position" {
			return in, invalid
		}
		seen[name] = true
		var data []byte
		if name == "file" {
			data, err = io.ReadAll(io.LimitReader(part, domain.MaxImageBytes+1))
			if len(data) > domain.MaxImageBytes {
				return in, &domain.Error{Status: 413, Code: "image_too_large"}
			}
			in.DeclaredType, _, _ = mime.ParseMediaType(part.Header.Get("Content-Type"))
			in.Data = data
		} else {
			if part.FileName() != "" {
				return in, invalid
			}
			data, err = io.ReadAll(part)
			switch name {
			case "alt_text":
				in.AltText = string(data)
			case "variant_id":
				value := string(data)
				in.VariantID = &value
			case "position":
				position, parseErr := strconv.ParseInt(string(data), 10, 32)
				if parseErr != nil {
					return in, invalid
				}
				in.Position = int32(position)
			}
		}
		if err != nil {
			return in, multipartError(err)
		}
		if err := part.Close(); err != nil {
			return in, multipartError(err)
		}
	}
	// Read any multipart epilogue too: the request bound applies to all bytes,
	// including trailing data in chunked requests with no Content-Length.
	if _, err := io.Copy(io.Discard, r.Body); err != nil {
		return in, multipartError(err)
	}
	if !seen["file"] || !seen["alt_text"] {
		return in, invalid
	}
	return in, nil
}
func multipartError(err error) error {
	var oversized *http.MaxBytesError
	if errors.As(err, &oversized) {
		return &domain.Error{Status: 413, Code: "image_too_large"}
	}
	return &domain.Error{Status: 400, Code: "bad_request"}
}
func mediaJSON(w http.ResponseWriter, status int, image domain.AdminImage) {
	data, err := json.Marshal(image)
	if err != nil {
		mediaProblem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("ETag", `"`+strconv.FormatInt(int64(image.ProductVersion), 10)+`"`)
	w.WriteHeader(status)
	_, _ = w.Write(data)
}
func mediaProblem(w http.ResponseWriter, err error) {
	problem := &domain.Error{Status: 500, Code: "internal_error"}
	var known *domain.Error
	if errors.As(err, &known) {
		problem = known
	} else if errors.Is(err, domain.ErrMediaUnavailable) {
		problem = &domain.Error{Status: 503, Code: "media_unavailable"}
	}
	body := struct {
		Type   string              `json:"type"`
		Title  string              `json:"title"`
		Status int                 `json:"status"`
		Code   string              `json:"code"`
		Detail string              `json:"detail"`
		Errors []domain.FieldError `json:"errors,omitempty"`
	}{"https://monteluna.example/problems/" + strings.ReplaceAll(problem.Code, "_", "-"), http.StatusText(problem.Status), problem.Status, problem.Code, "The media request could not be completed.", problem.Fields}
	data, _ := json.Marshal(body)
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(problem.Status)
	_, _ = w.Write(data)
}

type mediaWriter struct {
	http.ResponseWriter
	written bool
}

func (w *mediaWriter) WriteHeader(status int) {
	if w.written {
		return
	}
	w.written = true
	w.Header().Set("Cache-Control", "no-store")
	w.ResponseWriter.WriteHeader(status)
}
func (w *mediaWriter) Write(data []byte) (int, error) {
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}
func (w *mediaWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func mediaNoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(&mediaWriter{ResponseWriter: w}, r)
	})
}
