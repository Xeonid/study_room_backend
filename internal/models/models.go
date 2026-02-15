package models

import "time"

type User struct {
	ID           int
	Name         string
	Email        string
	PasswordHash string
	Role         string
	CreatedAt    time.Time
}

type Room struct {
	ID       int
	Name     string
	Capacity int
	Location string
	IsActive bool
}

type Reservation struct {
	ID        int
	RoomID    int
	UserID    int
	StartTime time.Time
	EndTime   time.Time
	Status    string
	CreatedAt time.Time
}
