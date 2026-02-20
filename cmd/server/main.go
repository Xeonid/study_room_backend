package main

import (
	_ "database/sql"
	"log"
	"net/http"

	_ "github.com/mattn/go-sqlite3"

	"study_room_backend/internal/db"
	"study_room_backend/internal/handlers"
	"study_room_backend/internal/middleware"
)

func main() {
	// Initialize database
	database := db.InitDB()

	// Initialize handlers
	authHandler := &handlers.AuthHandler{DB: database}
	roomHandler := &handlers.RoomHandler{DB: database}
	resHandler := &handlers.ReservationHandler{DB: database}

	// Create mux
	mux := http.NewServeMux()

	// ---------- AUTH ----------
	mux.HandleFunc("/api/register", authHandler.Register)
	mux.HandleFunc("/api/login", authHandler.Login)

	// ---------- ROOMS ----------
	mux.Handle("/api/rooms", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.GetRooms)))
	mux.Handle("/api/rooms/create", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.CreateRoom)))
	mux.Handle("/api/rooms/delete", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.DeleteRoom)))

	// ---------- RESERVATIONS ----------
	mux.Handle("/api/reservations", middleware.AuthMiddleware(http.HandlerFunc(resHandler.Reservations)))

	// Wrap with CORS
	handler := enableCORS(mux)

	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

		// Handle preflight request
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
