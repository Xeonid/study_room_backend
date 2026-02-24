-- ------------------------
-- Users Table
-- ------------------------
CREATE TABLE IF NOT EXISTS users (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     name TEXT NOT NULL,
                                     email TEXT NOT NULL UNIQUE,
                                     password TEXT NOT NULL,
                                     role TEXT NOT NULL DEFAULT 'student'
);

-- ------------------------
-- Rooms Table
-- ------------------------
CREATE TABLE IF NOT EXISTS rooms (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     name TEXT NOT NULL,
                                     capacity INTEGER NOT NULL
);

-- ------------------------
-- Reservations Table
-- ------------------------
CREATE TABLE IF NOT EXISTS reservations (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            room_id INTEGER NOT NULL,
                                            user_id INTEGER NOT NULL,
                                            start_time DATETIME NOT NULL,
                                            end_time DATETIME NOT NULL,
                                            status TEXT NOT NULL DEFAULT 'active',
                                            FOREIGN KEY (room_id) REFERENCES rooms(id),
                                            FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ------------------------
-- Room Naming Migration
-- ------------------------
UPDATE rooms
SET name = 'Dr. Volt''s Reactor Bay #' || id
WHERE name GLOB 'Room *';

-- ------------------------
-- Sample Data
-- ------------------------
INSERT INTO rooms (name, capacity) VALUES
                                       ('Tesla Coil Test Chamber', 4),
                                       ('Professor Neutrino''s Think Tank', 6),
                                       ('Quantum Pickle Containment Lab', 2);
