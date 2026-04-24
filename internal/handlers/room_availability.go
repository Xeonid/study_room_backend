package handlers

import (
	"context"
	"database/sql"
	"time"
)

type roomAvailability struct {
	ID                int
	Name              string
	Capacity          int
	ReservedAttendees int
	AvailableCapacity int
}

func getRoomAvailability(ctx context.Context, tx queryRower, roomID int, startTime, endTime time.Time) (roomAvailability, error) {
	var availability roomAvailability
	err := tx.QueryRowContext(ctx, `
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
		-- Reservation writes use this helper as the final gate, so inactive rooms are rejected here too.
		WHERE rooms.id = ?
		  AND rooms.is_active = 1
		GROUP BY rooms.id, rooms.name, rooms.capacity
	`, endTime, startTime, roomID).Scan(
		&availability.ID,
		&availability.Name,
		&availability.Capacity,
		&availability.ReservedAttendees,
	)
	if err != nil {
		return roomAvailability{}, err
	}

	availability.AvailableCapacity = availability.Capacity - availability.ReservedAttendees
	return availability, nil
}

type queryRower interface {
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}
