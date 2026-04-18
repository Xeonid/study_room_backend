package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"study_room_backend/internal/middleware"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	schema := `
	CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT NOT NULL UNIQUE,
		password TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'student'
	);
	CREATE TABLE rooms (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		capacity INTEGER NOT NULL,
		note TEXT NOT NULL DEFAULT '',
		is_active INTEGER NOT NULL DEFAULT 1,
		deactivation_reason TEXT NOT NULL DEFAULT ''
	);
	CREATE TABLE reservations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		room_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		start_time DATETIME NOT NULL,
		end_time DATETIME NOT NULL,
		attendee_count INTEGER NOT NULL DEFAULT 1,
		status TEXT NOT NULL DEFAULT 'active'
	);
	INSERT INTO users (id, name, email, password, role) VALUES (1, 'Test User', 'test@example.com', 'x', 'student');
	INSERT INTO rooms (id, name, capacity, note, is_active, deactivation_reason) VALUES (1, 'Room A', 6, 'Quiet zone', 1, ''), (2, 'Room B', 2, 'Projector available', 1, '');
	INSERT INTO reservations (room_id, user_id, start_time, end_time, attendee_count, status)
	VALUES (1, 1, '2026-04-14T10:00:00Z', '2026-04-14T11:00:00Z', 4, 'active');
	`

	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("seed db: %v", err)
	}

	return db
}

func requestWithUser(method, target, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, 1)
	return req.WithContext(ctx)
}

func TestCreateReservationAllowsOverlapWithinRemainingCapacity(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &ReservationHandler{DB: db}
	body := `{"room_id":1,"start_time":"2026-04-14T10:15:00Z","end_time":"2026-04-14T10:45:00Z","attendee_count":2}`
	req := requestWithUser(http.MethodPost, "/api/reservations", body)
	rec := httptest.NewRecorder()

	handler.CreateReservation(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d with body %s", rec.Code, rec.Body.String())
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM reservations WHERE room_id = 1").Scan(&count); err != nil {
		t.Fatalf("count reservations: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 reservations, got %d", count)
	}
}

func TestCreateReservationRejectsWhenOverlapExceedsCapacity(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &ReservationHandler{DB: db}
	body := `{"room_id":1,"start_time":"2026-04-14T10:15:00Z","end_time":"2026-04-14T10:45:00Z","attendee_count":3}`
	req := requestWithUser(http.MethodPost, "/api/reservations", body)
	rec := httptest.NewRecorder()

	handler.CreateReservation(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %s", rec.Code, rec.Body.String())
	}
}

func TestCreateReservationRejectsTooShortDuration(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &ReservationHandler{DB: db}
	body := `{"room_id":1,"start_time":"2026-04-14T12:00:00Z","end_time":"2026-04-14T12:10:00Z","attendee_count":1}`
	req := requestWithUser(http.MethodPost, "/api/reservations", body)
	rec := httptest.NewRecorder()

	handler.CreateReservation(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateReservationRechecksCapacity(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO reservations (id, room_id, user_id, start_time, end_time, attendee_count, status)
		VALUES (2, 2, 1, '2026-04-14T12:00:00Z', '2026-04-14T13:00:00Z', 1, 'active')
	`); err != nil {
		t.Fatalf("seed editable reservation: %v", err)
	}

	handler := &ReservationHandler{DB: db}
	body := `{"room_id":1,"start_time":"2026-04-14T10:15:00Z","end_time":"2026-04-14T10:45:00Z","attendee_count":3}`
	req := requestWithUser(http.MethodPut, "/api/reservations?id=2", body)
	rec := httptest.NewRecorder()

	handler.UpdateReservation(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %s", rec.Code, rec.Body.String())
	}
}

func TestGetRoomsReportsAvailableCapacityForTimeWindow(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &RoomHandler{DB: db}
	start := time.Date(2026, 4, 14, 10, 15, 0, 0, time.UTC)
	end := time.Date(2026, 4, 14, 10, 45, 0, 0, time.UTC)
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/rooms?start_time="+start.Format(time.RFC3339)+"&end_time="+end.Format(time.RFC3339)+"&required_capacity=1",
		nil,
	)
	rec := httptest.NewRecorder()

	handler.GetRooms(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var rooms []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &rooms); err != nil {
		t.Fatalf("decode rooms: %v", err)
	}
	if len(rooms) != 2 {
		t.Fatalf("expected 2 rooms, got %d", len(rooms))
	}

	roomA := rooms[0]
	if roomA["name"] != "Room A" {
		t.Fatalf("expected first room to be Room A, got %#v", roomA["name"])
	}
	if roomA["available_capacity"] != float64(2) {
		t.Fatalf("expected Room A to have 2 available seats, got %#v", roomA["available_capacity"])
	}
	if roomA["fits_required_capacity"] != true {
		t.Fatalf("expected Room A to fit required capacity, got %#v", roomA["fits_required_capacity"])
	}
	if roomA["note"] != "Quiet zone" {
		t.Fatalf("expected Room A note to be present, got %#v", roomA["note"])
	}
	if roomA["upcoming_reservations"] == nil {
		t.Fatalf("expected room summary metadata in payload")
	}
}

func TestGetRoomsCanIncludeUnavailableOptions(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &RoomHandler{DB: db}
	start := time.Date(2026, 4, 14, 10, 15, 0, 0, time.UTC)
	end := time.Date(2026, 4, 14, 10, 45, 0, 0, time.UTC)
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/rooms?start_time="+start.Format(time.RFC3339)+"&end_time="+end.Format(time.RFC3339)+"&required_capacity=3&include_unavailable=true",
		nil,
	)
	rec := httptest.NewRecorder()

	handler.GetRooms(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var rooms []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &rooms); err != nil {
		t.Fatalf("decode rooms: %v", err)
	}
	if len(rooms) != 2 {
		t.Fatalf("expected 2 rooms, got %d", len(rooms))
	}
	if rooms[0]["fits_required_capacity"] != false {
		t.Fatalf("expected Room A to be marked unavailable for group size 3, got %#v", rooms[0]["fits_required_capacity"])
	}
}

func TestGetRoomsCanExcludeEditedReservationFromAvailability(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &RoomHandler{DB: db}
	start := time.Date(2026, 4, 14, 10, 15, 0, 0, time.UTC)
	end := time.Date(2026, 4, 14, 10, 45, 0, 0, time.UTC)
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/rooms?start_time="+start.Format(time.RFC3339)+"&end_time="+end.Format(time.RFC3339)+"&required_capacity=4&include_unavailable=true&exclude_reservation_id=1",
		nil,
	)
	rec := httptest.NewRecorder()

	handler.GetRooms(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var rooms []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &rooms); err != nil {
		t.Fatalf("decode rooms: %v", err)
	}
	if len(rooms) != 2 {
		t.Fatalf("expected 2 rooms, got %d", len(rooms))
	}

	roomA := rooms[0]
	if roomA["available_capacity"] != float64(6) {
		t.Fatalf("expected Room A to have 6 available seats when excluding reservation 1, got %#v", roomA["available_capacity"])
	}
	if roomA["fits_required_capacity"] != true {
		t.Fatalf("expected Room A to fit required capacity when excluding reservation 1, got %#v", roomA["fits_required_capacity"])
	}
}

func TestUpdateRoomUpdatesNameAndCapacity(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	handler := &RoomHandler{DB: db}
	req := httptest.NewRequest(http.MethodPut, "/api/rooms/update?id=1", strings.NewReader(`{"name":"Updated Room","capacity":8}`))
	rec := httptest.NewRecorder()

	handler.UpdateRoom(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var name string
	var capacity int
	if err := db.QueryRow("SELECT name, capacity FROM rooms WHERE id = 1").Scan(&name, &capacity); err != nil {
		t.Fatalf("load room: %v", err)
	}
	if name != "Updated Room" || capacity != 8 {
		t.Fatalf("expected updated room, got %s / %d", name, capacity)
	}
}

func TestDeactivateRoomCancelsFutureReservationsWhenRequested(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO reservations (id, room_id, user_id, start_time, end_time, attendee_count, status)
		VALUES (2, 1, 1, '2099-04-14T12:00:00Z', '2099-04-14T13:00:00Z', 1, 'active')
	`); err != nil {
		t.Fatalf("seed future reservation: %v", err)
	}

	handler := &RoomHandler{DB: db}
	req := httptest.NewRequest(http.MethodPost, "/api/rooms/deactivate?id=1", strings.NewReader(`{"cancel_future":true,"reason":"Maintenance window"}`))
	rec := httptest.NewRecorder()

	handler.DeactivateRoom(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var isActive int
	if err := db.QueryRow("SELECT is_active FROM rooms WHERE id = 1").Scan(&isActive); err != nil {
		t.Fatalf("load room: %v", err)
	}
	if isActive != 0 {
		t.Fatalf("expected room to be inactive, got %d", isActive)
	}

	var reason string
	if err := db.QueryRow("SELECT deactivation_reason FROM rooms WHERE id = 1").Scan(&reason); err != nil {
		t.Fatalf("load deactivation reason: %v", err)
	}
	if reason != "Maintenance window" {
		t.Fatalf("expected deactivation reason to be saved, got %q", reason)
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM reservations WHERE id = 2").Scan(&count); err != nil {
		t.Fatalf("count future reservations: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected future reservation to be deleted, got count %d", count)
	}
}
