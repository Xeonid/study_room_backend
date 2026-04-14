package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"study_room_backend/internal/utils"
)

type RoomHandler struct {
	DB *sql.DB
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

	query := `
		SELECT
			rooms.id,
			rooms.name,
			rooms.capacity,
			0 AS reserved_attendees
		FROM rooms
		ORDER BY rooms.name
	`
	args := []interface{}{}
	if hasWindow {
		query = `
			SELECT
				rooms.id,
				rooms.name,
				rooms.capacity,
				COALESCE(SUM(
					CASE
						WHEN reservations.status = 'active'
						 AND datetime(reservations.start_time) < datetime(?)
						 AND datetime(reservations.end_time) > datetime(?)
						THEN reservations.attendee_count
						ELSE 0
					END
				), 0) AS reserved_attendees
			FROM rooms
			LEFT JOIN reservations ON reservations.room_id = rooms.id
			GROUP BY rooms.id, rooms.name, rooms.capacity
			ORDER BY rooms.name
		`
		args = append(args, endTime, startTime)
	}

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to fetch rooms", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []map[string]interface{}
	for rows.Next() {
		var id, capacity, reservedAttendees int
		var name string
		if err := rows.Scan(&id, &name, &capacity, &reservedAttendees); err != nil {
			http.Error(w, "Failed to parse rooms", http.StatusInternalServerError)
			return
		}

		availableCapacity := capacity
		if hasWindow {
			availableCapacity = capacity - reservedAttendees
		}
		fitsRequiredCapacity := requiredCapacity == 0 || availableCapacity >= requiredCapacity
		if !includeUnavailable && !fitsRequiredCapacity {
			continue
		}

		rooms = append(rooms, map[string]interface{}{
			"id":                     id,
			"name":                   name,
			"capacity":               capacity,
			"reserved_attendees":     reservedAttendees,
			"available_capacity":     availableCapacity,
			"fits_required_capacity": fitsRequiredCapacity,
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
	var body struct {
		Name     string `json:"name"`
		Capacity int    `json:"capacity"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	_, err := h.DB.Exec(
		"INSERT INTO rooms (name, capacity) VALUES (?, ?)",
		body.Name, body.Capacity,
	)
	if err != nil {
		http.Error(w, "Failed to create room", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusCreated, map[string]string{"message": "Room created"})
}

// DeleteRoom removes a room
func (h *RoomHandler) DeleteRoom(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, _ := strconv.Atoi(idStr)

	_, err := h.DB.Exec("DELETE FROM rooms WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Failed to delete room", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"message": "Room deleted"})
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
