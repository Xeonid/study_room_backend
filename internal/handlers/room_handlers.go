package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"study_room_backend/internal/utils"
)

type RoomHandler struct {
	DB *sql.DB
}

// GetRooms returns all rooms
func (h *RoomHandler) GetRooms(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query("SELECT id, name, capacity FROM rooms")
	if err != nil {
		http.Error(w, "Failed to fetch rooms", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []map[string]interface{}
	for rows.Next() {
		var id, capacity int
		var name string
		rows.Scan(&id, &name, &capacity)

		rooms = append(rooms, map[string]interface{}{
			"id":       id,
			"name":     name,
			"capacity": capacity,
		})
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
