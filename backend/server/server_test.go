package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func do(t *testing.T, h http.Handler, method, path, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, strings.TrimSpace(rec.Body.String())
}

func TestCalculateEndpoint(t *testing.T) {
	h := New("")
	tests := []struct {
		name, path, body string
		wantCode         int
		wantBody         string
	}{
		{"add", "/api/add", `{"operands":[2,3]}`, 200, `{"result":5}`},
		{"decimal noise is rounded", "/api/add", `{"operands":[0.1,0.2]}`, 200, `{"result":0.3}`},
		{"sqrt is unary", "/api/sqrt", `{"operands":[81]}`, 200, `{"result":9}`},
		{"percentage", "/api/percentage", `{"operands":[15,200]}`, 200, `{"result":30}`},
		{"division by zero", "/api/divide", `{"operands":[1,0]}`, 422, `{"error":"cannot divide by zero"}`},
		{"negative root", "/api/sqrt", `{"operands":[-1]}`, 422, `{"error":"cannot take the square root of a negative number"}`},
		{"overflow", "/api/power", `{"operands":[10,400]}`, 422, `{"error":"result is too large"}`},
		{"unknown operation", "/api/modulo", `{"operands":[1,2]}`, 404, ""},
		{"too few operands", "/api/add", `{"operands":[1]}`, 400, `{"error":"wrong number of operands: add takes 2, got 1"}`},
		{"missing operands", "/api/add", `{}`, 400, `{"error":"wrong number of operands: add takes 2, got 0"}`},
		{"not JSON", "/api/add", `2+3`, 400, ""},
		{"empty body", "/api/add", ``, 400, ""},
		{"string operand", "/api/add", `{"operands":["2",3]}`, 400, ""},
		{"null operand", "/api/add", `{"operands":[null,3]}`, 400, ""},
		{"number out of float64 range", "/api/add", `{"operands":[1e400,1]}`, 400, ""},
		{"unknown field", "/api/add", `{"operands":[1,2],"a":1}`, 400, ""},
		{"trailing data", "/api/add", `{"operands":[1,2]}{}`, 400, ""},
		// Padding sits inside the value, so decoding must read past the 1 KB limit.
		{"body too large", "/api/add", `{"operands":[1,` + strings.Repeat(" ", 2048) + `2]}`, 400, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, body := do(t, h, http.MethodPost, tt.path, tt.body)
			if code != tt.wantCode {
				t.Errorf("status = %d, want %d (body %s)", code, tt.wantCode, body)
			}
			if tt.wantBody != "" && body != tt.wantBody {
				t.Errorf("body = %s, want %s", body, tt.wantBody)
			}
			if !strings.HasPrefix(body, `{"result":`) && !strings.HasPrefix(body, `{"error":`) {
				t.Errorf("body is not a result or error object: %s", body)
			}
		})
	}
}

func TestResponsesAreJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/divide", strings.NewReader(`{"operands":[1,0]}`))
	rec := httptest.NewRecorder()
	New("").ServeHTTP(rec, req)
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

func TestOnlyPostIsAllowed(t *testing.T) {
	// With and without the frontend mounted, which adds a catch-all GET /.
	for _, dir := range []string{"", t.TempDir()} {
		for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
			req := httptest.NewRequest(method, "/api/add", nil)
			rec := httptest.NewRecorder()
			New(dir).ServeHTTP(rec, req)
			if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != http.MethodPost {
				t.Errorf("%s /api/add (static %q): status %d, Allow %q; want 405, POST", method, dir, rec.Code, rec.Header().Get("Allow"))
			}
			if body := strings.TrimSpace(rec.Body.String()); body != `{"error":"method not allowed: use POST"}` {
				t.Errorf("%s /api/add body = %s", method, body)
			}
		}
	}
}

func TestServesFrontend(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>calc</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := New(dir)

	code, body := do(t, h, http.MethodGet, "/", "")
	if code != 200 || body != "<h1>calc</h1>" {
		t.Errorf("GET / = %d %q, want 200 index.html", code, body)
	}
	if code, _ := do(t, h, http.MethodPost, "/api/add", `{"operands":[1,1]}`); code != 200 {
		t.Errorf("API next to static files: status %d, want 200", code)
	}
}
