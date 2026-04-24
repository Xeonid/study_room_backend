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
	Confirm       bool      `json:"confirm"`
}

const (
	minReservationDuration  = 15 * time.Minute
	maxReservationDuration  = 8 * time.Hour
	minReservationGap       = 15 * time.Minute
	reservationChangeCutoff = 15 * time.Minute
	businessOpenHour        = 8
	businessCloseHour       = 20
	maxReservationsPerDay   = 2
	maxReservationHours     = 20
	maxUpcomingReservations = 5
	maxLeadTimeDays         = 14
)

var errRoomInactive = errors.New("Room is inactive")
var nowFunc = func() time.Time {
	return time.Now()
}

// -------------------- Create --------------------
func (h *ReservationHandler) CreateReservation(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)
	role, _ := r.Context().Value(middleware.RoleKey).(string)
	now := nowFunc()

	var req CreateReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if err := validateReservationRequest(req, now, role); err != nil {
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
	if err := ensureReservationWithinPolicy(r.Context(), conn, userID, role, req, 0); err != nil {
		writeReservationPolicyError(w, err)
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
	role, _ := r.Context().Value(middleware.RoleKey).(string)
	now := nowFunc()
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
	if err := validateReservationRequest(req, now, role); err != nil {
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
	if err := ensureReservationChangeAllowed(r.Context(), conn, userID, role, resID, "edited"); err != nil {
		writeReservationPolicyError(w, err)
		return
	}

	if err := ensureReservationFitsCapacity(r.Context(), conn, req, resID); err != nil {
		writeReservationCapacityError(w, err)
		return
	}
	if err := ensureReservationWithinPolicy(r.Context(), conn, userID, role, req, resID); err != nil {
		writeReservationPolicyError(w, err)
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

func (h *ReservationHandler) GetReservationLimits(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)
	role, _ := r.Context().Value(middleware.RoleKey).(string)

	startTime, endTime, hasWindow, err := parseAvailabilityWindow(
		r.URL.Query().Get("start_time"),
		r.URL.Query().Get("end_time"),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	excludeReservationID, err := parseOptionalReservationID(r.URL.Query().Get("exclude_reservation_id"))
	if err != nil {
		http.Error(w, "Invalid exclude reservation ID", http.StatusBadRequest)
		return
	}

	now := nowFunc()
	limits, err := buildReservationLimitsResponse(r.Context(), h.DB, userID, role, hasWindow, startTime, endTime, excludeReservationID, now)
	if err != nil {
		http.Error(w, "Failed to load reservation limits", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, limits)
}

// -------------------- List --------------------
func (h *ReservationHandler) GetReservations(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	h.writeReservationsList(w, `
		SELECT reservations.id, reservations.room_id, COALESCE(rooms.name, 'Room #' || reservations.room_id), rooms.capacity, reservations.start_time, reservations.end_time, reservations.attendee_count, reservations.status, '' AS user_name, '' AS user_email
		FROM reservations
		LEFT JOIN rooms ON reservations.room_id = rooms.id
		WHERE user_id = ?
		ORDER BY reservations.start_time DESC
	`, userID)
}

func (h *ReservationHandler) AdminGetReservations(w http.ResponseWriter, r *http.Request) {
	h.writeReservationsList(w, `
		SELECT reservations.id, reservations.room_id, COALESCE(rooms.name, 'Room #' || reservations.room_id), rooms.capacity, reservations.start_time, reservations.end_time, reservations.attendee_count, reservations.status, users.name, users.email
		FROM reservations
		LEFT JOIN rooms ON reservations.room_id = rooms.id
		LEFT JOIN users ON reservations.user_id = users.id
		ORDER BY reservations.start_time DESC
	`)
}

func (h *ReservationHandler) writeReservationsList(w http.ResponseWriter, query string, args ...interface{}) {
	rows, err := h.DB.Query(`
	`+query, args...)
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
		var roomName, userName, userEmail string
		var start, end time.Time
		var status string
		if err := rows.Scan(&id, &roomID, &roomName, &roomCapacity, &start, &end, &attendeeCount, &status, &userName, &userEmail); err != nil {
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
			"user_name":      userName,
			"user_email":     userEmail,
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
	role, _ := r.Context().Value(middleware.RoleKey).(string)
	resID, err := reservationIDFromRequest(r)
	if err != nil {
		http.Error(w, "Invalid reservation ID", http.StatusBadRequest)
		return
	}

	if err := ensureReservationChangeAllowed(r.Context(), h.DB, userID, role, resID, "cancelled"); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Reservation not found or not owned by you", http.StatusNotFound)
			return
		}
		writeReservationPolicyError(w, err)
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

func (h *ReservationHandler) AdminDeleteReservation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	resID, err := reservationIDFromRequest(r)
	if err != nil {
		http.Error(w, "Invalid reservation ID", http.StatusBadRequest)
		return
	}

	result, err := h.DB.Exec(`
        DELETE FROM reservations
        WHERE id = ?
    `, resID)
	if err != nil {
		http.Error(w, "Failed to delete reservation", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Reservation not found", http.StatusNotFound)
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
	// SQLite needs an immediate transaction here so overlapping reservations cannot overbook the same room.
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

func validateReservationRequest(req CreateReservationRequest, now time.Time, role string) error {
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
	if !req.Confirm {
		return errors.New("reservation confirmation is required")
	}
	if isAdminRole(role) {
		return nil
	}
	if req.StartTime.Before(now) {
		return errors.New("reservation must start after the current date and time")
	}
	if req.StartTime.After(now.AddDate(0, 0, maxLeadTimeDays)) {
		return errors.New("reservations can only be made up to 14 days in advance")
	}

	startLocal := req.StartTime.In(time.Local)
	endLocal := req.EndTime.In(time.Local)
	if !sameLocalDay(startLocal, endLocal) {
		return errors.New("reservation must start and end on the same day")
	}
	if !isWithinBusinessHours(startLocal, endLocal) {
		return errors.New("reservations are only allowed between 08:00 and 20:00")
	}
	return nil
}

func ensureReservationWithinPolicy(ctx context.Context, conn *sql.Conn, userID int, role string, req CreateReservationRequest, excludeReservationID int) error {
	if isAdminRole(role) {
		return nil
	}

	startLocal := req.StartTime.In(time.Local)
	dayUsage, err := countUserReservationsOnDay(ctx, conn, userID, startLocal, excludeReservationID)
	if err != nil {
		return err
	}
	if dayUsage >= maxReservationsPerDay {
		return errors.New("students can only make 2 reservations per day")
	}

	weeklyHours, err := getUserReservedHoursForWeek(ctx, conn, userID, startLocal, excludeReservationID)
	if err != nil {
		return err
	}
	projectedHours := weeklyHours + req.EndTime.Sub(req.StartTime).Hours()
	if projectedHours > maxReservationHours {
		return errors.New("students can only reserve up to 20 hours per week")
	}

	hasConflict, err := hasReservationConflictOrQuickSuccession(ctx, conn, userID, req.StartTime, req.EndTime, excludeReservationID)
	if err != nil {
		return err
	}
	if hasConflict {
		return errors.New("reservations must be at least 15 minutes apart and cannot overlap your other reservations")
	}

	upcomingCount, err := countUpcomingReservations(ctx, conn, userID, excludeReservationID, nowFunc())
	if err != nil {
		return err
	}
	if upcomingCount >= maxUpcomingReservations {
		return errors.New("students can only hold 5 upcoming reservations at once")
	}

	return nil
}

func ensureReservationChangeAllowed(ctx context.Context, conn queryRower, userID int, role string, reservationID int, action string) error {
	if isAdminRole(role) {
		return nil
	}

	var startTime time.Time
	err := conn.QueryRowContext(ctx, `
		SELECT start_time
		FROM reservations
		WHERE id = ? AND user_id = ?
	`, reservationID, userID).Scan(&startTime)
	if err != nil {
		return err
	}

	if !startTime.After(nowFunc().Add(reservationChangeCutoff)) {
		return errors.New("reservations cannot be " + action + " after they start or within 15 minutes of the start time")
	}

	return nil
}

func ensureReservationFitsCapacity(ctx context.Context, conn *sql.Conn, req CreateReservationRequest, excludeReservationID int) error {
	availability, err := getRoomAvailability(ctx, conn, req.RoomID, req.StartTime, req.EndTime)
	if err == sql.ErrNoRows {
		// Differentiate "room does not exist" from "room exists but can no longer be reserved".
		var roomExists int
		checkErr := conn.QueryRowContext(ctx, `
			SELECT 1
			FROM rooms
			WHERE id = ?
		`, req.RoomID).Scan(&roomExists)
		if checkErr == sql.ErrNoRows {
			return err
		}
		if checkErr != nil {
			return checkErr
		}
		return errRoomInactive
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
	case errors.Is(err, errRoomInactive):
		http.Error(w, errRoomInactive.Error(), http.StatusConflict)
	case stringsEqualFold(err.Error(), "Requested group size exceeds room capacity"), stringsEqualFold(err.Error(), "Not enough remaining capacity for this time slot"):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, "Failed to check room availability", http.StatusInternalServerError)
	}
}

func writeReservationPolicyError(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusConflict)
}

type reservationUsageWindow struct {
	DayReservationCount int
	WeekHours           float64
}

type reservationLimitsResponse struct {
	Rules    map[string]interface{} `json:"rules"`
	Current  map[string]interface{} `json:"current"`
	Proposed map[string]interface{} `json:"proposed,omitempty"`
}

func buildReservationLimitsResponse(ctx context.Context, db *sql.DB, userID int, role string, hasWindow bool, startTime, endTime time.Time, excludeReservationID int, now time.Time) (reservationLimitsResponse, error) {
	if isAdminRole(role) {
		response := reservationLimitsResponse{
			Rules: map[string]interface{}{
				"applies":     false,
				"role":        "admin",
				"description": "Admin reservations are not subject to student reservation limits.",
			},
			Current: map[string]interface{}{
				"role": "admin",
			},
		}
		if hasWindow {
			response.Proposed = map[string]interface{}{
				"can_reserve": true,
				"violations":  []string{},
			}
		}
		return response, nil
	}

	currentDayCount, err := countUserReservationsOnDay(ctx, db, userID, now.In(time.Local), 0)
	if err != nil {
		return reservationLimitsResponse{}, err
	}
	currentWeekHours, err := getUserReservedHoursForWeek(ctx, db, userID, now.In(time.Local), 0)
	if err != nil {
		return reservationLimitsResponse{}, err
	}

	response := reservationLimitsResponse{
		Rules: map[string]interface{}{
			"must_confirm":              true,
			"earliest_hour":             "08:00",
			"latest_hour":               "20:00",
			"min_duration_minutes":      int(minReservationDuration / time.Minute),
			"max_duration_hours":        int(maxReservationDuration / time.Hour),
			"max_reservations_per_day":  maxReservationsPerDay,
			"max_hours_per_week":        maxReservationHours,
			"max_upcoming_reservations": maxUpcomingReservations,
			"max_lead_time_days":        maxLeadTimeDays,
			"change_cutoff_minutes":     int(reservationChangeCutoff / time.Minute),
			"minimum_gap_minutes":       int(minReservationGap / time.Minute),
			"must_be_in_future":         true,
			"same_day_reservation_only": true,
			"single_active_slot_only":   true,
		},
		Current: map[string]interface{}{
			"reference_date":               now.In(time.Local).Format("2006-01-02"),
			"reservations_today":           currentDayCount,
			"reservations_today_remaining": maxInt(maxReservationsPerDay-currentDayCount, 0),
			"hours_this_week":              roundHours(currentWeekHours),
			"hours_this_week_remaining":    roundHours(maxFloat(float64(maxReservationHours)-currentWeekHours, 0)),
		},
	}
	currentUpcomingCount, err := countUpcomingReservations(ctx, db, userID, 0, now)
	if err != nil {
		return reservationLimitsResponse{}, err
	}
	response.Current["upcoming_reservations"] = currentUpcomingCount
	response.Current["upcoming_reservations_remaining"] = maxInt(maxUpcomingReservations-currentUpcomingCount, 0)

	if !hasWindow {
		return response, nil
	}

	selectedDayCount, err := countUserReservationsOnDay(ctx, db, userID, startTime.In(time.Local), excludeReservationID)
	if err != nil {
		return reservationLimitsResponse{}, err
	}
	selectedWeekHours, err := getUserReservedHoursForWeek(ctx, db, userID, startTime.In(time.Local), excludeReservationID)
	if err != nil {
		return reservationLimitsResponse{}, err
	}
	selectedUpcomingCount, err := countUpcomingReservations(ctx, db, userID, excludeReservationID, now)
	if err != nil {
		return reservationLimitsResponse{}, err
	}

	durationHours := endTime.Sub(startTime).Hours()
	violations := make([]string, 0)
	proposedReq := CreateReservationRequest{
		RoomID:        1,
		StartTime:     startTime,
		EndTime:       endTime,
		AttendeeCount: 1,
		Confirm:       true,
	}
	if err := validateReservationRequest(proposedReq, now, role); err != nil {
		violations = append(violations, err.Error())
	}
	if hasQuickGap, err := hasReservationConflictOrQuickSuccession(ctx, db, userID, startTime, endTime, excludeReservationID); err != nil {
		return reservationLimitsResponse{}, err
	} else if hasQuickGap {
		violations = append(violations, "reservations must be at least 15 minutes apart and cannot overlap your other reservations")
	}
	if selectedDayCount >= maxReservationsPerDay {
		violations = append(violations, "students can only make 2 reservations per day")
	}
	if selectedWeekHours+durationHours > maxReservationHours {
		violations = append(violations, "students can only reserve up to 20 hours per week")
	}
	if selectedUpcomingCount >= maxUpcomingReservations {
		violations = append(violations, "students can only hold 5 upcoming reservations at once")
	}

	response.Proposed = map[string]interface{}{
		"selected_date":                      startTime.In(time.Local).Format("2006-01-02"),
		"selected_week_start":                weekStart(startTime.In(time.Local)).Format("2006-01-02"),
		"duration_hours":                     roundHours(durationHours),
		"reservations_on_selected_day":       selectedDayCount,
		"reservations_on_selected_day_after": selectedDayCount + 1,
		"remaining_on_selected_day_after":    maxInt(maxReservationsPerDay-(selectedDayCount+1), 0),
		"hours_on_selected_week":             roundHours(selectedWeekHours),
		"hours_on_selected_week_after":       roundHours(selectedWeekHours + durationHours),
		"remaining_on_selected_week_after":   roundHours(maxFloat(float64(maxReservationHours)-(selectedWeekHours+durationHours), 0)),
		"upcoming_reservations_after":        selectedUpcomingCount + 1,
		"remaining_upcoming_after":           maxInt(maxUpcomingReservations-(selectedUpcomingCount+1), 0),
		"can_reserve":                        len(violations) == 0,
		"violations":                         violations,
	}

	return response, nil
}

func countUserReservationsOnDay(ctx context.Context, tx queryRower, userID int, day time.Time, excludeReservationID int) (int, error) {
	var count int
	err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM reservations
		WHERE user_id = ?
		  AND status = 'active'
		  AND date(start_time, 'localtime') = ?
		  AND (? = 0 OR id != ?)
	`, userID, day.Format("2006-01-02"), excludeReservationID, excludeReservationID).Scan(&count)
	return count, err
}

func countUpcomingReservations(ctx context.Context, tx queryRower, userID int, excludeReservationID int, now time.Time) (int, error) {
	var count int
	err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM reservations
		WHERE user_id = ?
		  AND status = 'active'
		  AND datetime(start_time) > datetime(?)
		  AND (? = 0 OR id != ?)
	`, userID, now, excludeReservationID, excludeReservationID).Scan(&count)
	return count, err
}

func getUserReservedHoursForWeek(ctx context.Context, tx queryer, userID int, anchor time.Time, excludeReservationID int) (float64, error) {
	start := weekStart(anchor)
	end := start.AddDate(0, 0, 7)

	rows, err := tx.QueryContext(ctx, `
		SELECT start_time, end_time
		FROM reservations
		WHERE user_id = ?
		  AND status = 'active'
		  AND datetime(end_time) > datetime(?)
		  AND datetime(start_time) < datetime(?)
		  AND (? = 0 OR id != ?)
	`, userID, start, end, excludeReservationID, excludeReservationID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	totalHours := 0.0
	for rows.Next() {
		var reservationStart time.Time
		var reservationEnd time.Time
		if err := rows.Scan(&reservationStart, &reservationEnd); err != nil {
			return 0, err
		}
		clippedStart := maxTime(reservationStart, start)
		clippedEnd := minTime(reservationEnd, end)
		if clippedEnd.After(clippedStart) {
			totalHours += clippedEnd.Sub(clippedStart).Hours()
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	return totalHours, nil
}

func hasReservationConflictOrQuickSuccession(ctx context.Context, tx queryer, userID int, startTime, endTime time.Time, excludeReservationID int) (bool, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT start_time, end_time
		FROM reservations
		WHERE user_id = ?
		  AND status = 'active'
		  AND (? = 0 OR id != ?)
		  AND datetime(end_time) > datetime(?, '-15 minutes')
		  AND datetime(start_time) < datetime(?, '+15 minutes')
	`, userID, excludeReservationID, excludeReservationID, startTime, endTime)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var existingStart time.Time
		var existingEnd time.Time
		if err := rows.Scan(&existingStart, &existingEnd); err != nil {
			return false, err
		}
		if existingEnd.Add(minReservationGap).After(startTime) && existingStart.Before(endTime.Add(minReservationGap)) {
			return true, nil
		}
	}

	return false, rows.Err()
}

func isWithinBusinessHours(startLocal, endLocal time.Time) bool {
	open := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), businessOpenHour, 0, 0, 0, startLocal.Location())
	close := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), businessCloseHour, 0, 0, 0, startLocal.Location())
	return !startLocal.Before(open) && !endLocal.After(close)
}

func sameLocalDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

func weekStart(t time.Time) time.Time {
	local := t.In(time.Local)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
	start = start.AddDate(0, 0, -int(start.Weekday()))
	return start
}

func roundHours(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func isAdminRole(role string) bool {
	return stringsEqualFold(role, "admin")
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

type queryer interface {
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
}
