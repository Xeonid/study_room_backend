package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
	RoomID        int       `json:"room_id"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	AttendeeCount int       `json:"attendee_count"`
}

const (
	minReservationDuration = 15 * time.Minute
	maxReservationDuration = 8 * time.Hour
)

// -------------------- Create --------------------
func (h *ReservationHandler) CreateReservation(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	var req CreateReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if err := validateReservationRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	conn, committed, err := beginImmediateReservationTx(r.Context(), h.DB)
	if err != nil {
		http.Error(w, "Transaction failed", http.StatusInternalServerError)
		return
	}
	defer committed(false)

	if err := ensureReservationFitsCapacity(r.Context(), conn, req, 0); err != nil {
		writeReservationCapacityError(w, err)
		return
	}

	_, err = conn.ExecContext(r.Context(), `
		INSERT INTO reservations (room_id, user_id, start_time, end_time, attendee_count)
		VALUES (?, ?, ?, ?, ?)
	`, req.RoomID, userID, req.StartTime, req.EndTime, req.AttendeeCount)
	if err != nil {
		http.Error(w, "Failed to create reservation", http.StatusInternalServerError)
		return
	}

	if err := committed(true); err != nil {
		http.Error(w, "Failed to finalize reservation", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"message": "Reservation created"})
}

func (h *ReservationHandler) UpdateReservation(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)
	resID, err := reservationIDFromRequest(r)
	if err != nil {
		http.Error(w, "Invalid reservation ID", http.StatusBadRequest)
		return
	}

	var req CreateReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if err := validateReservationRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	conn, committed, err := beginImmediateReservationTx(r.Context(), h.DB)
	if err != nil {
		http.Error(w, "Transaction failed", http.StatusInternalServerError)
		return
	}
	defer committed(false)

	var existingID int
	err = conn.QueryRowContext(r.Context(), `
		SELECT id
		FROM reservations
		WHERE id = ? AND user_id = ?
	`, resID, userID).Scan(&existingID)
	if err == sql.ErrNoRows {
		http.Error(w, "Reservation not found or not owned by you", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Failed to load reservation", http.StatusInternalServerError)
		return
	}

	if err := ensureReservationFitsCapacity(r.Context(), conn, req, resID); err != nil {
		writeReservationCapacityError(w, err)
		return
	}

	result, err := conn.ExecContext(r.Context(), `
		UPDATE reservations
		SET room_id = ?, start_time = ?, end_time = ?, attendee_count = ?
		WHERE id = ? AND user_id = ?
	`, req.RoomID, req.StartTime, req.EndTime, req.AttendeeCount, resID, userID)
	if err != nil {
		http.Error(w, "Failed to update reservation", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Reservation not found or not owned by you", http.StatusNotFound)
		return
	}

	if err := committed(true); err != nil {
		http.Error(w, "Failed to finalize reservation", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Reservation updated"})
}

// -------------------- List --------------------
func (h *ReservationHandler) GetReservations(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	rows, err := h.DB.Query(`
		SELECT reservations.id, reservations.room_id, COALESCE(rooms.name, 'Room #' || reservations.room_id), rooms.capacity, reservations.start_time, reservations.end_time, reservations.attendee_count, reservations.status
		FROM reservations
		LEFT JOIN rooms ON reservations.room_id = rooms.id
		WHERE user_id = ?
		ORDER BY reservations.start_time DESC
	`, userID)
	if err != nil {
		http.Error(w, "Failed to fetch reservations", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var reservations []map[string]interface{}
	for rows.Next() {
		var id, roomID int
		var roomCapacity sql.NullInt64
		var attendeeCount int
		var roomName string
		var start, end time.Time
		var status string
		if err := rows.Scan(&id, &roomID, &roomName, &roomCapacity, &start, &end, &attendeeCount, &status); err != nil {
			http.Error(w, "Failed to parse reservations", http.StatusInternalServerError)
			return
		}

		reservations = append(reservations, map[string]interface{}{
			"id":             id,
			"room_id":        roomID,
			"room_name":      roomName,
			"room":           roomName,
			"start_time":     start,
			"end_time":       end,
			"attendee_count": attendeeCount,
			"room_capacity":  nullIntToValue(roomCapacity),
			"status":         status,
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
	resID, err := reservationIDFromRequest(r)
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

func beginImmediateReservationTx(ctx context.Context, db *sql.DB) (*sql.Conn, func(bool) error, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, nil, err
	}
	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		conn.Close()
		return nil, nil, err
	}

	done := false
	finalize := func(commit bool) error {
		if done {
			return nil
		}
		done = true
		defer conn.Close()
		if commit {
			_, err := conn.ExecContext(ctx, "COMMIT")
			return err
		}
		_, err := conn.ExecContext(ctx, "ROLLBACK")
		return err
	}

	return conn, finalize, nil
}

func validateReservationRequest(req CreateReservationRequest) error {
	if req.RoomID <= 0 {
		return errors.New("invalid room ID")
	}
	if req.AttendeeCount <= 0 {
		return errors.New("attendee count must be greater than zero")
	}
	if !req.EndTime.After(req.StartTime) {
		return errors.New("end time must be after start time")
	}

	duration := req.EndTime.Sub(req.StartTime)
	if duration < minReservationDuration {
		return errors.New("reservation must be at least 15 minutes")
	}
	if duration > maxReservationDuration {
		return errors.New("reservation cannot exceed 8 hours")
	}
	return nil
}

func ensureReservationFitsCapacity(ctx context.Context, conn *sql.Conn, req CreateReservationRequest, excludeReservationID int) error {
	availability, err := getRoomAvailability(ctx, conn, req.RoomID, req.StartTime, req.EndTime)
	if err == sql.ErrNoRows {
		return err
	}
	if err != nil {
		return err
	}

	excludedAttendees := 0
	if excludeReservationID > 0 {
		err = conn.QueryRowContext(ctx, `
			SELECT COALESCE(attendee_count, 0)
			FROM reservations
			WHERE id = ? AND room_id = ?
			  AND status = 'active'
			  AND datetime(start_time) < datetime(?)
			  AND datetime(end_time) > datetime(?)
		`, excludeReservationID, req.RoomID, req.EndTime, req.StartTime).Scan(&excludedAttendees)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
	}

	effectiveAvailable := availability.AvailableCapacity + excludedAttendees
	if req.AttendeeCount > availability.Capacity {
		return errors.New("Requested group size exceeds room capacity")
	}
	if req.AttendeeCount > effectiveAvailable {
		return errors.New("Not enough remaining capacity for this time slot")
	}
	return nil
}

func writeReservationCapacityError(w http.ResponseWriter, err error) {
	switch {
	case err == sql.ErrNoRows:
		http.Error(w, "Room not found", http.StatusNotFound)
	case stringsEqualFold(err.Error(), "Requested group size exceeds room capacity"), stringsEqualFold(err.Error(), "Not enough remaining capacity for this time slot"):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, "Failed to check room availability", http.StatusInternalServerError)
	}
}

func reservationIDFromRequest(r *http.Request) (int, error) {
	return strconv.Atoi(r.URL.Query().Get("id"))
}

func nullIntToValue(v sql.NullInt64) interface{} {
	if !v.Valid {
		return nil
	}
	return v.Int64
}

func stringsEqualFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		ra := a[i]
		rb := b[i]
		if ra >= 'A' && ra <= 'Z' {
			ra += 'a' - 'A'
		}
		if rb >= 'A' && rb <= 'Z' {
			rb += 'a' - 'A'
		}
		if ra != rb {
			return false
		}
	}
	return true
}
