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

	// Handlers
	authHandler := &handlers.AuthHandler{DB: database}
	roomHandler := &handlers.RoomHandler{DB: database}
	resHandler := &handlers.ReservationHandler{DB: database}

	// Router
	mux := http.NewServeMux()

	// -------------------- Auth --------------------
	mux.HandleFunc("/api/register", authHandler.Register)
	mux.HandleFunc("/api/login", authHandler.Login)

	// -------------------- Rooms --------------------
	mux.Handle("/api/rooms", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.GetRooms)))
	mux.Handle("/api/rooms/create", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.CreateRoom)))
	mux.Handle("/api/rooms/delete", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.DeleteRoom)))

	// -------------------- Reservations --------------------
	mux.Handle("/api/reservations", middleware.AuthMiddleware(http.HandlerFunc(resHandler.HandleReservations)))

	// -------------------- Server --------------------
	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
