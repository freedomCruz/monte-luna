package platform

import "net/http"

// RegisterRoutes mounts the platform endpoints on mux.
func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/health", handleHealth)
}

// handleHealth reports that the process can serve requests.
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
