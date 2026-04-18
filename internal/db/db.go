package db

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"log"
	"os"
	"strings"
)

func InitDB() *sql.DB {
	dbFile := "database.db"
	db, err := sql.Open("sqlite3", dbFile)
	if err != nil {
		log.Fatal(err)
	}

	schema, err := os.ReadFile("schema.sql")
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(string(schema))
	if err != nil {
		log.Fatal(err)
	}
	if _, err := db.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		log.Fatal(err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		log.Fatal(err)
	}

	migrations := []string{
		"ALTER TABLE reservations ADD COLUMN attendee_count INTEGER NOT NULL DEFAULT 1",
		"ALTER TABLE rooms ADD COLUMN note TEXT NOT NULL DEFAULT ''",
		"ALTER TABLE rooms ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
		"ALTER TABLE rooms ADD COLUMN deactivation_reason TEXT NOT NULL DEFAULT ''",
	}
	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			log.Fatal(err)
		}
	}
	if err := migrateLegacyUserRoles(db); err != nil {
		log.Fatal(err)
	}
	if err := migrateLegacyReservationForeignKeys(db); err != nil {
		log.Fatal(err)
	}

	return db
}

func migrateLegacyUserRoles(db *sql.DB) error {
	var usersTableSQL string
	err := db.QueryRow("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").Scan(&usersTableSQL)
	if err != nil {
		return err
	}

	normalized := strings.ToLower(usersTableSQL)
	if !strings.Contains(normalized, "check(role in ('student','teacher'))") {
		return nil
	}

	statements := []string{
		"PRAGMA foreign_keys = OFF",
		"ALTER TABLE users RENAME TO users_old",
		`CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password TEXT NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')) DEFAULT 'student'
		)`,
		"INSERT INTO users (id, name, email, password, role) SELECT id, name, email, password, role FROM users_old",
		"DROP TABLE users_old",
		"PRAGMA foreign_keys = ON",
	}

	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}

	return nil
}

func migrateLegacyReservationForeignKeys(db *sql.DB) error {
	var reservationsTableSQL string
	err := db.QueryRow("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reservations'").Scan(&reservationsTableSQL)
	if err != nil {
		return err
	}

	normalized := strings.ToLower(reservationsTableSQL)
	if !strings.Contains(normalized, `"users_old"`) && !strings.Contains(normalized, "references users_old") {
		return nil
	}

	statements := []string{
		"PRAGMA foreign_keys = OFF",
		"ALTER TABLE reservations RENAME TO reservations_old",
		`CREATE TABLE reservations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			room_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			start_time DATETIME NOT NULL,
			end_time DATETIME NOT NULL,
			attendee_count INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'active',
			FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`INSERT INTO reservations (id, room_id, user_id, start_time, end_time, attendee_count, status)
		 SELECT id, room_id, user_id, start_time, end_time, COALESCE(attendee_count, 1), status
		 FROM reservations_old`,
		"DROP TABLE reservations_old",
		"PRAGMA foreign_keys = ON",
	}

	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}

	return nil
}
