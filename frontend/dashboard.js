// dashboard.js

// -------------------- Helpers --------------------
function getToken() {
    return localStorage.getItem("token");
}

async function writeJSON(res) {
    try {
        return await res.json();
    } catch (err) {
        console.error("Failed to parse JSON:", err);
        return null;
    }
}

// -------------------- Reservations --------------------
async function fetchReservations() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/reservations", {
        headers: { "Authorization": "Bearer " + token }
    });

    const data = await writeJSON(res);
    console.log("Reservations fetched:", data);

    const tbody = document.querySelector("#reservationsTable tbody");
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">No reservations yet</td></tr>`;
        return;
    }

    data.forEach(r => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${r.id}</td>
            <td>${r.room_id}</td>
            <td>${new Date(r.start_time).toLocaleString()}</td>
            <td>${new Date(r.end_time).toLocaleString()}</td>
            <td>${r.status}</td>
            <td>
                <button class="btn btn-danger btn-sm">Delete</button>
            </td>
        `;

        // Attach delete handler
        const deleteBtn = tr.querySelector("button");
        deleteBtn.addEventListener("click", () => deleteReservation(r.id));

        tbody.appendChild(tr);
    });
}

async function deleteReservation(resID) {
    const token = getToken();
    if (!token) return;

    const res = await fetch(`/api/reservations?id=${resID}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    });

    if (res.ok) {
        fetchReservations(); // refresh table
    } else {
        const err = await res.text();
        alert("Failed to delete reservation: " + err);
    }
}

// -------------------- Available Rooms --------------------
async function fetchRooms() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/rooms", {
        headers: { "Authorization": "Bearer " + token }
    });

    const rooms = await writeJSON(res);
    console.log("Rooms fetched:", rooms);

    const select = document.getElementById("roomSelect");
    select.innerHTML = "";

    if (!rooms || rooms.length === 0) {
        select.innerHTML = `<option disabled>No rooms available</option>`;
        return;
    }

    rooms.forEach(room => {
        const option = document.createElement("option");
        option.value = room.id;
        option.textContent = `${room.name} (Capacity: ${room.capacity})`;
        select.appendChild(option);
    });
}

// -------------------- Create Reservation --------------------
async function createReservation(event) {
    event.preventDefault();
    const token = getToken();
    if (!token) return;

    const roomID = document.getElementById("roomSelect").value;
    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;

    if (!roomID || !startTime || !endTime) {
        alert("Please select a room, start, and end time");
        return;
    }

    const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            room_id: Number(roomID),
            start_time: new Date(startTime).toISOString(),
            end_time: new Date(endTime).toISOString()
        })
    });

    if (!res.ok) {
        const err = await res.text();
        alert("Failed to create reservation: " + err);
        return;
    }

    fetchReservations(); // refresh table
}

// -------------------- Init --------------------
function initDashboard() {
    const token = getToken();
    if (!token) {
        location.href = "index.html"; // redirect if not logged in
        return;
    }

    fetchRooms();
    fetchReservations();

    document.getElementById("reservationForm").addEventListener("submit", createReservation);
}

// -------------------- Run on page load --------------------
window.addEventListener("DOMContentLoaded", initDashboard);