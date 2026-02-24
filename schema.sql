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
SET name = (
               CASE (id % 7)
                   WHEN 0 THEN 'Tesla Coil Test Chamber'
                   WHEN 1 THEN 'Professor Neutrino''s Think Tank'
                   WHEN 2 THEN 'Quantum Pickle Containment Lab'
                   WHEN 3 THEN 'ChronoSpark Reactor'
                   WHEN 4 THEN 'Neon Nebula Lab'
                   WHEN 5 THEN 'Antimatter Annex'
                   ELSE 'CryoCore Chamber'
                   END
               ) || ' #' || id
WHERE name GLOB 'Room *'
   OR name LIKE 'Dr. Volt''s Reactor Bay%'
   OR name IN (
              'ChronoSpark Reactor 101',
              'Neon Nebula Lab 102',
              'Antimatter Annex Alpha',
              'Biohazard Brainstorm Beta',
              'CryoCore Chamber Gamma',
              'Tesla Coil Test Chamber',
              'Professor Neutrino''s Think Tank',
              'Quantum Pickle Containment Lab'
   );

-- ------------------------
-- Sample Data
-- ------------------------
INSERT INTO rooms (name, capacity)
SELECT name, capacity
FROM (
         SELECT 'Tesla Coil Test Chamber #1' AS name, 4 AS capacity
         UNION ALL
         SELECT 'Professor Neutrino''s Think Tank #2', 6
         UNION ALL
         SELECT 'Quantum Pickle Containment Lab #3', 2
     ) seeded_rooms
WHERE NOT EXISTS (SELECT 1 FROM rooms);
