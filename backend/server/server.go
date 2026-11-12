// Package server exposes the calculator over a JSON REST API.
package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"calculator/calc"
)

// maxBodyBytes caps request bodies; a valid one is a few dozen bytes.
const maxBodyBytes = 1 << 10

type request struct {
	// Pointers, because encoding/json silently decodes null into 0.
	Operands []*float64 `json:"operands"`
}

type result struct {
	Result float64 `json:"result"`
}

type failure struct {
	Error string `json:"error"`
}

// New returns the HTTP handler. The API lives under /api/; when staticDir is
// non-empty the built frontend is served from it at /, so both share an origin.
func New(staticDir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/{operation}", calculate)
	// Everything else under /api gets a JSON error too, never the file server's HTML or the mux's text.
	mux.HandleFunc("/api/{operation}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, failure{"method not allowed: use POST"})
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, failure{"not found: use POST /api/{operation}"})
	})
	if staticDir != "" {
		mux.Handle("/", static(staticDir)) // no method in the pattern: "GET /" would conflict with "/api/{operation}"
	}
	return mux
}

// static serves the built frontend: GET and HEAD only, and no directory listings.
func static(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method != http.MethodGet && r.Method != http.MethodHead:
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		case r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/"):
			http.NotFound(w, r)
		default:
			files.ServeHTTP(w, r)
		}
	})
}

func calculate(w http.ResponseWriter, r *http.Request) {
	var req request
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, failure{"invalid request body: " + err.Error()})
		return
	}
	// Only whitespace may follow the object. Token (unlike More) reports read errors,
	// so data hidden past the size limit is rejected too.
	if _, err := dec.Token(); err != io.EOF {
		msg := "unexpected data after JSON object"
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			msg = err.Error()
		}
		writeJSON(w, http.StatusBadRequest, failure{"invalid request body: " + msg})
		return
	}

	operands := make([]float64, len(req.Operands))
	for i, x := range req.Operands {
		if x == nil {
			writeJSON(w, http.StatusBadRequest, failure{"invalid request body: operands must be numbers, not null"})
			return
		}
		operands[i] = *x
	}

	n, err := calc.Calculate(r.PathValue("operation"), operands)
	var mathErr *calc.MathError
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, result{n})
	case errors.Is(err, calc.ErrUnknownOperation):
		writeJSON(w, http.StatusNotFound, failure{err.Error()})
	case errors.As(err, &mathErr):
		writeJSON(w, http.StatusUnprocessableEntity, failure{err.Error()})
	default: // ErrOperandCount
		writeJSON(w, http.StatusBadRequest, failure{err.Error()})
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body) // headers are sent; nothing useful to do on failure
}
