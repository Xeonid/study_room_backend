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

// -------------------- Initialize Flatpickr --------------------
function initPickers() {
    flatpickr("#startPicker", {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        minuteIncrement: 5,
        allowInput: false
    });
    flatpickr("#endPicker", {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        minuteIncrement: 5,
        allowInput: false
    });
}

// -------------------- Fetch Rooms --------------------
async function fetchRooms() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/rooms", {
        headers: { "Authorization": "Bearer " + token }
    });

    const rooms = await writeJSON(res);
    const select = document.getElementById("roomSelect");
    select.innerHTML = "";

    rooms.forEach(room => {
        const option = document.createElement("option");
        option.value = room.id;
        option.textContent = `${room.name} (Capacity: ${room.capacity})`;
        select.appendChild(option);
    });
}

// -------------------- Fetch Reservations --------------------
async function fetchReservations() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/reservations", {
        headers: { "Authorization": "Bearer " + token }
    });

    const data = await writeJSON(res);
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
                <button class="btn btn-danger btn-sm" onclick="deleteReservation(${r.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// -------------------- Create Reservation --------------------
async function createReservation(event) {
    event.preventDefault();
    const token = getToken();
    if (!token) return;

    const roomID = document.getElementById("roomSelect").value;
    const startTime = document.getElementById("startPicker")._flatpickr.selectedDates[0];
    const endTime = document.getElementById("endPicker")._flatpickr.selectedDates[0];

    if (!startTime || !endTime) {
        alert("Please select start and end times");
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
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString()
        })
    });

    if (!res.ok) {
        const err = await res.text();
        alert("Failed to create reservation: " + err);
        return;
    }

    fetchReservations();
}

// -------------------- Delete Reservation --------------------
async function deleteReservation(resID) {
    const token = getToken();
    if (!token) return;

    const res = await fetch(`/api/reservations?id=${resID}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) {
        const err = await res.text();
        alert("Failed to delete reservation: " + err);
        return;
    }

    fetchReservations();
}

// -------------------- Init Dashboard --------------------
function initDashboard() {
    const token = getToken();
    if (!token) {
        location.href = "index.html";
        return;
    }

    initPickers();
    fetchRooms();
    fetchReservations();

    document.getElementById("reservationForm").addEventListener("submit", createReservation);
}

window.addEventListener("DOMContentLoaded", initDashboard);