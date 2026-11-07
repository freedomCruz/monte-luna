package adapters

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

type R2 struct {
	*Media
	client *s3.Client
	bucket string
}

func NewR2(base, endpoint, bucket, access, secret string) (*R2, error) {
	resolver, err := NewMedia(base)
	if err != nil {
		return nil, err
	}
	if endpoint == "" || bucket == "" || access == "" || secret == "" {
		return nil, errors.New("R2 configuration is incomplete")
	}
	client := s3.New(s3.Options{
		BaseEndpoint: aws.String(endpoint), Region: "auto", UsePathStyle: true,
		Credentials: credentials.NewStaticCredentialsProvider(access, secret, ""),
		HTTPClient:  &http.Client{Timeout: 30 * time.Second}, RetryMaxAttempts: 1,
		// R2 does not implement every optional AWS trailing-checksum extension.
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &R2{Media: resolver, client: client, bucket: bucket}, nil
}

func uploadKey(key string) bool {
	parts := strings.Split(key, "/")
	if len(parts) != 4 || parts[0] != "catalog" || parts[1] != "products" || !domain.ValidAdminID(parts[2]) {
		return false
	}
	id, ext, ok := strings.Cut(parts[3], ".")
	return ok && domain.ValidAdminID(id) && (ext == "jpg" || ext == "png" || ext == "webp")
}
func (r *R2) Put(ctx context.Context, key, contentType string, data []byte) error {
	if !uploadKey(key) {
		return errors.New("invalid generated media key")
	}
	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(r.bucket), Key: aws.String(key), ContentType: aws.String(contentType), Body: bytes.NewReader(data), IfNoneMatch: aws.String("*")})
	if err != nil {
		var api smithy.APIError
		if errors.As(err, &api) && (api.ErrorCode() == "PreconditionFailed" || api.ErrorCode() == "ConditionalRequestConflict") {
			return domain.ErrMediaKeyConflict
		}
		return domain.ErrMediaUnavailable
	}
	return nil
}
func (r *R2) Delete(ctx context.Context, key string) error {
	if !uploadKey(key) {
		return errors.New("invalid generated media key")
	}
	_, err := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(r.bucket), Key: aws.String(key)})
	if err != nil {
		return domain.ErrMediaUnavailable
	}
	return nil
}
