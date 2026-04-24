package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"study_room_backend/internal/utils"
)

type RoomHandler struct {
	DB *sql.DB
}

type roomPayload struct {
	Name               string `json:"name"`
	Capacity           int    `json:"capacity"`
	Note               string `json:"note"`
	IsActive           bool   `json:"is_active"`
	DeactivationReason string `json:"deactivation_reason"`
}

type roomDeactivateRequest struct {
	CancelFuture       bool   `json:"cancel_future"`
	Reason             string `json:"reason"`
	DeactivationReason string `json:"deactivation_reason"`
}

type roomDeactivateResponse struct {
	Message                     string `json:"message"`
	CancelledFutureReservations int64  `json:"cancelled_future_reservations"`
}

// GetRooms returns all rooms
func (h *RoomHandler) GetRooms(w http.ResponseWriter, r *http.Request) {
	requiredCapacity, err := parseRequiredCapacity(r.URL.Query().Get("required_capacity"))
	if err != nil {
		http.Error(w, "Invalid required capacity", http.StatusBadRequest)
		return
	}

	startTime, endTime, hasWindow, err := parseAvailabilityWindow(
		r.URL.Query().Get("start_time"),
		r.URL.Query().Get("end_time"),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	includeUnavailable := parseIncludeUnavailable(r.URL.Query().Get("include_unavailable"))
	includeInactive := parseIncludeInactive(r.URL.Query().Get("include_inactive"))
	excludeReservationID, err := parseOptionalReservationID(r.URL.Query().Get("exclude_reservation_id"))
	if err != nil {
		http.Error(w, "Invalid exclude reservation ID", http.StatusBadRequest)
		return
	}

	query := `
		SELECT
			rooms.id,
			rooms.name,
			rooms.capacity,
			rooms.note,
			rooms.is_active,
			rooms.deactivation_reason,
			COALESCE(SUM(
				CASE
					WHEN reservations.status = 'active'
					 AND datetime(reservations.start_time) <= datetime('now')
					 AND datetime(reservations.end_time) >= datetime('now')
					THEN 1
					ELSE 0
				END
			), 0) AS active_now_reservations,
			COALESCE(SUM(
				CASE
					WHEN reservations.status = 'active'
					 AND datetime(reservations.start_time) > datetime('now')
					THEN 1
					ELSE 0
				END
			), 0) AS upcoming_reservations,
			COALESCE(SUM(
				CASE
					WHEN reservations.status = 'active'
					 AND date(reservations.start_time) = date('now', 'localtime')
					THEN 1
					ELSE 0
				END
			), 0) AS reservations_today,
			COALESCE(SUM(
				CASE
					WHEN reservations.status = 'active'
					 AND date(reservations.start_time) >= date('now', 'localtime', '-6 days')
					 AND date(reservations.start_time) <= date('now', 'localtime')
					THEN 1
					ELSE 0
				END
			), 0) AS reservations_this_week,
			0 AS reserved_attendees
		FROM rooms
		LEFT JOIN reservations ON reservations.room_id = rooms.id
		WHERE (? = 1 OR rooms.is_active = 1)
		GROUP BY rooms.id, rooms.name, rooms.capacity, rooms.note, rooms.is_active, rooms.deactivation_reason
		ORDER BY rooms.name
	`
	args := []interface{}{boolToSQLite(includeInactive)}
	if hasWindow {
		// When editing an existing booking, the client can exclude its current attendees from the overlap check.
		query = `
			SELECT
				rooms.id,
				rooms.name,
				rooms.capacity,
				rooms.note,
				rooms.is_active,
				rooms.deactivation_reason,
				COALESCE(SUM(
					CASE
						WHEN reservations.status = 'active'
						 AND datetime(reservations.start_time) <= datetime('now')
						 AND datetime(reservations.end_time) >= datetime('now')
						THEN 1
						ELSE 0
					END
				), 0) AS active_now_reservations,
				COALESCE(SUM(
					CASE
						WHEN reservations.status = 'active'
						 AND datetime(reservations.start_time) > datetime('now')
						THEN 1
						ELSE 0
					END
				), 0) AS upcoming_reservations,
				COALESCE(SUM(
					CASE
						WHEN reservations.status = 'active'
						 AND date(reservations.start_time) = date('now', 'localtime')
						THEN 1
						ELSE 0
					END
				), 0) AS reservations_today,
				COALESCE(SUM(
					CASE
						WHEN reservations.status = 'active'
						 AND date(reservations.start_time) >= date('now', 'localtime', '-6 days')
						 AND date(reservations.start_time) <= date('now', 'localtime')
						THEN 1
						ELSE 0
					END
				), 0) AS reservations_this_week,
				COALESCE(SUM(
					CASE
						WHEN reservations.status = 'active'
						 AND datetime(reservations.start_time) < datetime(?)
						 AND datetime(reservations.end_time) > datetime(?)
						 AND (? = 0 OR reservations.id != ?)
						THEN reservations.attendee_count
						ELSE 0
					END
				), 0) AS reserved_attendees
			FROM rooms
			LEFT JOIN reservations ON reservations.room_id = rooms.id
			WHERE (? = 1 OR rooms.is_active = 1)
			GROUP BY rooms.id, rooms.name, rooms.capacity, rooms.note, rooms.is_active, rooms.deactivation_reason
			ORDER BY rooms.name
		`
		args = []interface{}{endTime, startTime, excludeReservationID, excludeReservationID, boolToSQLite(includeInactive)}
	}

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to fetch rooms", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []map[string]interface{}
	for rows.Next() {
		var id, capacity, reservedAttendees, activeNowReservations, upcomingReservations, reservationsToday, reservationsThisWeek int
		var isActive int
		var name, note, deactivationReason string
		if err := rows.Scan(
			&id,
			&name,
			&capacity,
			&note,
			&isActive,
			&deactivationReason,
			&activeNowReservations,
			&upcomingReservations,
			&reservationsToday,
			&reservationsThisWeek,
			&reservedAttendees,
		); err != nil {
			http.Error(w, "Failed to parse rooms", http.StatusInternalServerError)
			return
		}

		availableCapacity := capacity
		if hasWindow {
			availableCapacity = capacity - reservedAttendees
		}
		fitsRequiredCapacity := requiredCapacity == 0 || availableCapacity >= requiredCapacity
		// Some UIs need to display undersized/full rooms as disabled instead of dropping them from the payload.
		if !includeUnavailable && !fitsRequiredCapacity {
			continue
		}

		rooms = append(rooms, map[string]interface{}{
			"id":                      id,
			"name":                    name,
			"capacity":                capacity,
			"note":                    note,
			"is_active":               isActive == 1,
			"deactivation_reason":     deactivationReason,
			"active_now_reservations": activeNowReservations,
			"upcoming_reservations":   upcomingReservations,
			"reservations_today":      reservationsToday,
			"reservations_this_week":  reservationsThisWeek,
			"reserved_attendees":      reservedAttendees,
			"available_capacity":      availableCapacity,
			"fits_required_capacity":  fitsRequiredCapacity,
		})
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "Failed to fetch rooms", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, rooms)
}

// CreateRoom inserts a new room
func (h *RoomHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body roomPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Note = strings.TrimSpace(body.Note)
	body.DeactivationReason = strings.TrimSpace(body.DeactivationReason)
	if body.IsActive {
		body.DeactivationReason = ""
	}
	if err := validateRoomPayload(body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err := h.DB.Exec(
		"INSERT INTO rooms (name, capacity, note, is_active, deactivation_reason) VALUES (?, ?, ?, ?, ?)",
		body.Name, body.Capacity, body.Note, boolToSQLite(body.IsActive), body.DeactivationReason,
	)
	if err != nil {
		http.Error(w, "Failed to create room", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusCreated, map[string]string{"message": "Room created"})
}

func (h *RoomHandler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, err := roomIDFromQuery(r)
	if err != nil {
		http.Error(w, "Invalid room ID", http.StatusBadRequest)
		return
	}

	var body roomPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Note = strings.TrimSpace(body.Note)
	body.DeactivationReason = strings.TrimSpace(body.DeactivationReason)
	if body.IsActive {
		body.DeactivationReason = ""
	}
	if err := validateRoomPayload(body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec(
		"UPDATE rooms SET name = ?, capacity = ?, note = ?, is_active = ?, deactivation_reason = ? WHERE id = ?",
		body.Name, body.Capacity, body.Note, boolToSQLite(body.IsActive), body.DeactivationReason, id,
	)
	if err != nil {
		http.Error(w, "Failed to update room", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"message": "Room updated"})
}

// DeleteRoom removes a room
func (h *RoomHandler) DeleteRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, err := roomIDFromQuery(r)
	if err != nil {
		http.Error(w, "Invalid room ID", http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec("DELETE FROM rooms WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Failed to delete room", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"message": "Room deleted"})
}

func (h *RoomHandler) DeactivateRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, err := roomIDFromQuery(r)
	if err != nil {
		http.Error(w, "Invalid room ID", http.StatusBadRequest)
		return
	}
	cancelFuture, deactivationReason, err := parseDeactivateRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		http.Error(w, "Failed to start deactivation", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	result, err := tx.Exec("UPDATE rooms SET is_active = 0, deactivation_reason = ? WHERE id = ?", deactivationReason, id)
	if err != nil {
		http.Error(w, "Failed to deactivate room", http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Room not found", http.StatusNotFound)
		return
	}

	var cancelledCount int64
	if cancelFuture {
		now := time.Now().UTC()
		deleteResult, err := tx.Exec(`
			DELETE FROM reservations
			WHERE room_id = ?
			  AND datetime(start_time) > datetime(?)
		`, id, now)
		if err != nil {
			http.Error(w, "Failed to cancel future reservations", http.StatusInternalServerError)
			return
		}
		cancelledCount, _ = deleteResult.RowsAffected()
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Failed to finalize deactivation", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, roomDeactivateResponse{
		Message:                     "Room deactivated",
		CancelledFutureReservations: cancelledCount,
	})
}

func parseRequiredCapacity(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}

	requiredCapacity, err := strconv.Atoi(raw)
	if err != nil {
		return 0, err
	}
	if requiredCapacity <= 0 {
		return 0, fmt.Errorf("required capacity must be greater than zero")
	}

	return requiredCapacity, nil
}

func parseAvailabilityWindow(startRaw, endRaw string) (time.Time, time.Time, bool, error) {
	if startRaw == "" && endRaw == "" {
		// The room list endpoint also serves the pre-scheduling state where only static capacity matters.
		return time.Time{}, time.Time{}, false, nil
	}
	if startRaw == "" || endRaw == "" {
		return time.Time{}, time.Time{}, false, fmt.Errorf("start_time and end_time are both required")
	}

	startTime, err := time.Parse(time.RFC3339, startRaw)
	if err != nil {
		return time.Time{}, time.Time{}, false, err
	}
	endTime, err := time.Parse(time.RFC3339, endRaw)
	if err != nil {
		return time.Time{}, time.Time{}, false, err
	}
	if !endTime.After(startTime) {
		return time.Time{}, time.Time{}, false, fmt.Errorf("end_time must be after start_time")
	}

	return startTime, endTime, true, nil
}

func parseIncludeUnavailable(raw string) bool {
	return raw == "1" || raw == "true" || raw == "TRUE"
}

func parseIncludeInactive(raw string) bool {
	return raw == "1" || strings.EqualFold(raw, "true")
}

func parseCancelFuture(raw string) bool {
	return raw == "1" || strings.EqualFold(raw, "true")
}

func parseDeactivateRequest(r *http.Request) (bool, string, error) {
	cancelFuture := parseCancelFuture(r.URL.Query().Get("cancel_future"))
	reason := strings.TrimSpace(r.URL.Query().Get("reason"))

	if r.Body != nil && r.ContentLength != 0 {
		defer r.Body.Close()
		var body roomDeactivateRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
			return false, "", fmt.Errorf("invalid request")
		}
		if body.CancelFuture {
			cancelFuture = true
		}
		if strings.TrimSpace(body.Reason) != "" {
			reason = strings.TrimSpace(body.Reason)
		}
		if strings.TrimSpace(body.DeactivationReason) != "" {
			reason = strings.TrimSpace(body.DeactivationReason)
		}
	}

	if len(reason) > 160 {
		return false, "", fmt.Errorf("deactivation reason is too long")
	}

	return cancelFuture, reason, nil
}

func parseOptionalReservationID(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}

	reservationID, err := strconv.Atoi(raw)
	if err != nil || reservationID < 0 {
		return 0, fmt.Errorf("invalid reservation id")
	}

	return reservationID, nil
}

func roomIDFromQuery(r *http.Request) (int, error) {
	roomID, err := strconv.Atoi(r.URL.Query().Get("id"))
	if err != nil || roomID <= 0 {
		return 0, fmt.Errorf("invalid room id")
	}
	return roomID, nil
}

func validateRoomPayload(body roomPayload) error {
	if body.Name == "" {
		return fmt.Errorf("room name is required")
	}
	if body.Capacity <= 0 {
		return fmt.Errorf("capacity must be greater than zero")
	}
	if body.Capacity > 1000 {
		return fmt.Errorf("capacity is too large")
	}
	if len(body.Note) > 160 {
		return fmt.Errorf("note is too long")
	}
	if len(body.DeactivationReason) > 160 {
		return fmt.Errorf("deactivation reason is too long")
	}
	return nil
}

func boolToSQLite(v bool) int {
	if v {
		return 1
	}
	return 0
}
