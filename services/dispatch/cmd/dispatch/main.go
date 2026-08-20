package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/agent-market/dispatch/internal/dispatch"
)

const (
	maxRequestBodyBytes = 64 << 10
	maxRequestIDLength  = 128
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           newHandler(dispatch.NewEngine()),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("dispatch service listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func newHandler(engine *dispatch.Engine) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc("/v1/matches", matchesHandler(engine))
	mux.HandleFunc("/v1/agents", agentsHandler(engine))
	return withJSON(withRequestID(mux))
}

func healthHandler(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		writer.Header().Set("Allow", "GET, HEAD")
		writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	if request.Method == http.MethodHead {
		writer.WriteHeader(http.StatusOK)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

// agentsHandler serves the browsable catalog. It takes no filters: the market page needs the
// whole list, and narrowing it down to a task is what /v1/matches is for.
func agentsHandler(engine *dispatch.Engine) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.Header().Set("Allow", http.MethodGet)
			writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{
			"data":      engine.Catalog(),
			"requestId": request.Header.Get("X-Request-ID"),
		})
	}
}

func matchesHandler(engine *dispatch.Engine) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writer.Header().Set("Allow", http.MethodPost)
			writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeJSON(writer, http.StatusUnsupportedMediaType, map[string]string{"error": "Content-Type must be application/json"})
			return
		}

		request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodyBytes)
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()

		var payload dispatch.TaskRequest
		if err := decoder.Decode(&payload); err != nil {
			writeDecodeError(writer, err)
			return
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
			return
		}
		if err := dispatch.ValidateTaskRequest(payload); err != nil {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		payload = dispatch.NormalizeTaskRequest(payload)
		writeJSON(writer, http.StatusOK, map[string]any{
			"data":      engine.Recommend(payload),
			"requestId": request.Header.Get("X-Request-ID"),
		})
	}
}

func writeDecodeError(writer http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeJSON(writer, http.StatusRequestEntityTooLarge, map[string]string{"error": "request body is too large"})
		return
	}
	writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
}

func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestID := strings.TrimSpace(request.Header.Get("X-Request-ID"))
		if requestID != "" && !validRequestID(requestID) {
			writeJSON(writer, http.StatusBadRequest, map[string]string{"error": "invalid X-Request-ID header"})
			return
		}
		if requestID == "" {
			var err error
			requestID, err = newRequestID()
			if err != nil {
				writeJSON(writer, http.StatusInternalServerError, map[string]string{"error": "could not create request ID"})
				return
			}
		}

		request.Header.Set("X-Request-ID", requestID)
		writer.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(writer, request)
	})
}

func newRequestID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return "req_" + hex.EncodeToString(bytes), nil
}

func validRequestID(value string) bool {
	if len(value) == 0 || len(value) > maxRequestIDLength {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			strings.ContainsRune("-_.:", character) {
			continue
		}
		return false
	}
	return true
}

func withJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(writer, request)
	})
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		log.Printf("write response: %v", err)
	}
}
