package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"study_room_backend/internal/middleware"
)

// ReservationHandler handles reservations
type ReservationHandler struct {
	DB *sql.DB
}

// Request struct for creating a reservation
type CreateReservationRequest struct {
	RoomID    int       `json:"room_id"`
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
}

// -------------------- Create --------------------
func (h *ReservationHandler) CreateReservation(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	var req CreateReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		http.Error(w, "Transaction failed", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var exists int
	err = tx.QueryRow(`
		SELECT 1 FROM reservations
		WHERE room_id = ?
		  AND start_time < ?
		  AND end_time > ?
		  AND status = 'active'
	`, req.RoomID, req.EndTime, req.StartTime).Scan(&exists)

	if err == nil {
		http.Error(w, "Time slot already booked", http.StatusConflict)
		return
	}

	_, err = tx.Exec(`
		INSERT INTO reservations (room_id, user_id, start_time, end_time)
		VALUES (?, ?, ?, ?)
	`, req.RoomID, userID, req.StartTime, req.EndTime)
	if err != nil {
		http.Error(w, "Failed to create reservation", http.StatusInternalServerError)
		return
	}

	tx.Commit()
	writeJSON(w, http.StatusCreated, map[string]string{"message": "Reservation created"})
}

// -------------------- List --------------------
func (h *ReservationHandler) GetReservations(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	rows, err := h.DB.Query(`
		SELECT reservations.id, reservations.room_id, COALESCE(rooms.name, 'Room #' || reservations.room_id), reservations.start_time, reservations.end_time, reservations.status
		FROM reservations
		LEFT JOIN rooms ON reservations.room_id = rooms.id
		WHERE user_id = ?
	`, userID)
	if err != nil {
		http.Error(w, "Failed to fetch reservations", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var reservations []map[string]interface{}
	for rows.Next() {
		var id, roomID int
		var roomName string
		var start, end time.Time
		var status string
		if err := rows.Scan(&id, &roomID, &roomName, &start, &end, &status); err != nil {
			http.Error(w, "Failed to parse reservations", http.StatusInternalServerError)
			return
		}

		reservations = append(reservations, map[string]interface{}{
			"id":         id,
			"room_id":    roomID,
			"room_name":  roomName,
			"room":       roomName,
			"start_time": start,
			"end_time":   end,
			"status":     status,
		})
	}

	if err := rows.Err(); err != nil {
		http.Error(w, "Failed to fetch reservations", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, reservations)
}

// -------------------- Delete --------------------
// -------------------- Delete --------------------
func (h *ReservationHandler) DeleteReservation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.Context().Value(middleware.UserIDKey).(int)
	idStr := r.URL.Query().Get("id")
	resID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid reservation ID", http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec(`
        DELETE FROM reservations
        WHERE id = ? AND user_id = ?
    `, resID, userID)
	if err != nil {
		http.Error(w, "Failed to delete reservation", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Reservation not found or not owned by you", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Reservation deleted"})
}

// -------------------- Helper --------------------
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data == nil {
		data = []interface{}{}
	}
	json.NewEncoder(w).Encode(data)
}
