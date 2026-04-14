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
	}
	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			log.Fatal(err)
		}
	}

	return db
}
