package main

import (
	"log"
	"net/http"

	"study_room_backend/internal/db"
	"study_room_backend/internal/handlers"
	"study_room_backend/internal/middleware"
)

func main() {
	database := db.InitDB()

	authHandler := &handlers.AuthHandler{DB: database}
	roomHandler := &handlers.RoomHandler{DB: database}
	resHandler := &handlers.ReservationHandler{DB: database}

	mux := http.NewServeMux()

	// Serve frontend files
	fs := http.FileServer(http.Dir("./frontend"))
	mux.Handle("/", fs)

	// Auth
	mux.HandleFunc("/api/register", authHandler.Register)
	mux.HandleFunc("/api/login", authHandler.Login)

	// Rooms
	mux.Handle("/api/rooms", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.GetRooms)))
	mux.Handle("/api/rooms/create", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.CreateRoom)))
	mux.Handle("/api/rooms/delete", middleware.AuthMiddleware(http.HandlerFunc(roomHandler.DeleteRoom)))

	// Reservations — single path, switch on method
	mux.Handle("/api/reservations", middleware.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			resHandler.GetReservations(w, r)
		case http.MethodPost:
			resHandler.CreateReservation(w, r)
		case http.MethodDelete:
			resHandler.DeleteReservation(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
