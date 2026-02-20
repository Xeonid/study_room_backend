package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"study_room_backend/internal/middleware"
	"study_room_backend/internal/utils"
)

type ReservationHandler struct {
	DB *sql.DB
}

type ReservationRequest struct {
	Action        string    `json:"action"`
	ReservationID int       `json:"reservation_id,omitempty"`
	RoomID        int       `json:"room_id,omitempty"`
	StartTime     time.Time `json:"start_time,omitempty"`
	EndTime       time.Time `json:"end_time,omitempty"`
}

func (h *ReservationHandler) Reservations(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	req := &ReservationRequest{}
	if r.Method == http.MethodPost {
		if !utils.DecodeJSONBody(w, r, req) {
			return
		}
	}

	switch req.Action {
	case "create":
		h.createReservation(w, userID, req)
	case "delete":
		h.deleteReservation(w, userID, req)
	default:
		h.getReservations(w, userID)
	}
}

func (h *ReservationHandler) createReservation(w http.ResponseWriter, userID int, req *ReservationRequest) {
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
	utils.JSON(w, http.StatusCreated, map[string]string{"message": "Reservation created"})
}

func (h *ReservationHandler) deleteReservation(w http.ResponseWriter, userID int, req *ReservationRequest) {
	_, err := h.DB.Exec(`
		DELETE FROM reservations
		WHERE id = ? AND user_id = ?
	`, req.ReservationID, userID)
	if err != nil {
		http.Error(w, "Failed to delete reservation", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"message": "Reservation deleted"})
}

func (h *ReservationHandler) getReservations(w http.ResponseWriter, userID int) {
	rows, err := h.DB.Query(`
		SELECT id, room_id, start_time, end_time, status
		FROM reservations
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
		var start, end time.Time
		var status string
		rows.Scan(&id, &roomID, &start, &end, &status)

		reservations = append(reservations, map[string]interface{}{
			"id":         id,
			"room_id":    roomID,
			"start_time": start,
			"end_time":   end,
			"status":     status,
		})
	}

	utils.JSON(w, http.StatusOK, reservations)
}
