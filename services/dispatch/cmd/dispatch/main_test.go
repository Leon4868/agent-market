package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/agent-market/dispatch/internal/dispatch"
)

func TestHealthHandler(t *testing.T) {
	handler := newHandler(dispatch.NewEngine())
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusOK, response.Body.String())
	}
	if response.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected generated X-Request-ID response header")
	}
	if contentType := response.Header().Get("Content-Type"); contentType != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q", contentType)
	}
}

func TestHealthHandlerRejectsUnsupportedMethod(t *testing.T) {
	handler := newHandler(dispatch.NewEngine())
	request := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
	if allow := response.Header().Get("Allow"); allow != "GET, HEAD" {
		t.Fatalf("Allow = %q", allow)
	}
}

func TestMatchesHandler(t *testing.T) {
	handler := newHandler(dispatch.NewEngine())
	request := httptest.NewRequest(http.MethodPost, "/v1/matches", strings.NewReader(`{"category":"合约审查","tags":["Solidity"]}`))
	request.Header.Set("Content-Type", "application/json; charset=utf-8")
	request.Header.Set("X-Request-ID", "req-test-123")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusOK, response.Body.String())
	}
	if requestID := response.Header().Get("X-Request-ID"); requestID != "req-test-123" {
		t.Fatalf("X-Request-ID = %q", requestID)
	}
	var payload struct {
		Data      []dispatch.Candidate `json:"data"`
		RequestID string               `json:"requestId"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.RequestID != "req-test-123" || len(payload.Data) != 1 || payload.Data[0].ID != "agent_0x19bc" {
		t.Fatalf("unexpected response: %#v", payload)
	}
}

func TestMatchesHandlerRequestBoundaries(t *testing.T) {
	handler := newHandler(dispatch.NewEngine())
	tests := []struct {
		name        string
		method      string
		contentType string
		body        string
		requestID   string
		wantStatus  int
	}{
		{name: "method", method: http.MethodGet, wantStatus: http.StatusMethodNotAllowed},
		{name: "content type", method: http.MethodPost, body: `{}`, wantStatus: http.StatusUnsupportedMediaType},
		{name: "invalid JSON", method: http.MethodPost, contentType: "application/json", body: `{`, wantStatus: http.StatusBadRequest},
		{name: "unknown field", method: http.MethodPost, contentType: "application/json", body: `{"query":"audit","unknown":true}`, wantStatus: http.StatusBadRequest},
		{name: "trailing object", method: http.MethodPost, contentType: "application/json", body: `{"query":"audit"}{}`, wantStatus: http.StatusBadRequest},
		{name: "empty request", method: http.MethodPost, contentType: "application/json", body: `{}`, wantStatus: http.StatusBadRequest},
		{name: "oversized body", method: http.MethodPost, contentType: "application/json", body: `{"query":"` + strings.Repeat("a", maxRequestBodyBytes) + `"}`, wantStatus: http.StatusRequestEntityTooLarge},
		{name: "invalid request ID", method: http.MethodPost, contentType: "application/json", body: `{"query":"audit"}`, requestID: "contains space", wantStatus: http.StatusBadRequest},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, "/v1/matches", strings.NewReader(test.body))
			if test.contentType != "" {
				request.Header.Set("Content-Type", test.contentType)
			}
			if test.requestID != "" {
				request.Header.Set("X-Request-ID", test.requestID)
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", response.Code, test.wantStatus, response.Body.String())
			}
		})
	}
}

func TestValidRequestID(t *testing.T) {
	tests := []struct {
		value string
		want  bool
	}{
		{value: "req_123:part.test", want: true},
		{value: "contains space", want: false},
		{value: strings.Repeat("a", maxRequestIDLength+1), want: false},
		{value: "", want: false},
	}
	for _, test := range tests {
		if got := validRequestID(test.value); got != test.want {
			t.Errorf("validRequestID(%q) = %v, want %v", test.value, got, test.want)
		}
	}
}

func TestAgentsHandlerReturnsTheWholeCatalog(t *testing.T) {
	handler := newHandler(dispatch.NewEngine())
	request := httptest.NewRequest(http.MethodGet, "/v1/agents", nil)
	request.Header.Set("X-Request-ID", "req-test-catalog")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusOK, response.Body.String())
	}

	var body struct {
		Data      []dispatch.CatalogEntry `json:"data"`
		RequestID string                  `json:"requestId"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.RequestID != "req-test-catalog" {
		t.Fatalf("requestId = %q", body.RequestID)
	}
	if len(body.Data) != 5 {
		t.Fatalf("expected the full catalog, got %d entries", len(body.Data))
	}
	// Newcomers last, so a market page reading top-down never shows an empty-metrics agent above
	// one with real history.
	seenNewcomer := false
	for _, entry := range body.Data {
		if entry.IsNewcomer {
			seenNewcomer = true
			continue
		}
		if seenNewcomer {
			t.Fatalf("established agent %q sorted below a newcomer", entry.ID)
		}
	}
}

func TestAgentsHandlerRejectsUnsupportedMethod(t *testing.T) {
	handler := newHandler(dispatch.NewEngine())
	request := httptest.NewRequest(http.MethodPost, "/v1/agents", strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
}
