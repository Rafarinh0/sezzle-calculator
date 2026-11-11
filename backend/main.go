// Command calculator serves the calculator REST API (and, optionally, the frontend).
//
// Environment:
//
//	PORT        port to listen on (default 8080)
//	STATIC_DIR  directory with the built frontend to serve at / (default: none)
package main

import (
	"cmp"
	"log"
	"net/http"
	"os"
	"time"

	"calculator/server"
)

func main() {
	addr := ":" + cmp.Or(os.Getenv("PORT"), "8080")
	srv := &http.Server{
		Addr:              addr,
		Handler:           server.New(os.Getenv("STATIC_DIR")),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}
	log.Printf("calculator listening on %s", addr)
	log.Fatal(srv.ListenAndServe())
}
