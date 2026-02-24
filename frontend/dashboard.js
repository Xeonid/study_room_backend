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

// -------------------- Reservation Scheduler State --------------------
const schedulerState = {
    selectedDate: null,
    startDateTime: null,
    endDateTime: null,
    calendar: null,
    modal: null
};

function createOption(value, label) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    return option;
}

function initTimeSelectOptions() {
    const hourSelectIDs = ["startHour", "endHour"];
    const minuteSelectIDs = ["startMinute", "endMinute"];

    hourSelectIDs.forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = "";
        for (let hour = 0; hour < 24; hour += 1) {
            const label = String(hour).padStart(2, "0");
            select.appendChild(createOption(hour, label));
        }
    });

    minuteSelectIDs.forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = "";
        for (let min = 0; min < 60; min += 1) {
            const label = String(min).padStart(2, "0");
            select.appendChild(createOption(min, label));
        }
    });
}

function showCalendarStep() {
    document.getElementById("schedulerTitle").textContent = "Choose reservation date";
    document.getElementById("calendarStep").classList.remove("d-none");
    document.getElementById("timeStep").classList.add("d-none");

    const backBtn = document.getElementById("schedulerBackBtn");
    const nextBtn = document.getElementById("schedulerNextBtn");

    backBtn.classList.add("d-none");
    nextBtn.textContent = "Next";
    nextBtn.disabled = !schedulerState.selectedDate;
}

function getSelectedDateTimeFromInputs(prefix) {
    if (!schedulerState.selectedDate) {
        return null;
    }

    const hour = Number(document.getElementById(`${prefix}Hour`).value);
    const minute = Number(document.getElementById(`${prefix}Minute`).value);

    const dt = new Date(schedulerState.selectedDate);
    dt.setHours(hour, minute, 0, 0);
    return dt;
}

function syncSchedulerDateLabel() {
    const label = document.getElementById("selectedDateLabel");
    if (!schedulerState.selectedDate) {
        label.textContent = "No date selected";
        return;
    }

    label.textContent = `Reservation date: ${schedulerState.selectedDate.toLocaleDateString()}`;
}

function prefillTimeInputsIfChosen() {
    if (!schedulerState.startDateTime || !schedulerState.endDateTime) {
        document.getElementById("startHour").value = "9";
        document.getElementById("startMinute").value = "0";
        document.getElementById("endHour").value = "10";
        document.getElementById("endMinute").value = "0";
        return;
    }

    document.getElementById("startHour").value = String(schedulerState.startDateTime.getHours());
    document.getElementById("startMinute").value = String(schedulerState.startDateTime.getMinutes());
    document.getElementById("endHour").value = String(schedulerState.endDateTime.getHours());
    document.getElementById("endMinute").value = String(schedulerState.endDateTime.getMinutes());
}

function showTimeStep() {
    document.getElementById("schedulerTitle").textContent = "Choose start and end time";
    document.getElementById("calendarStep").classList.add("d-none");
    document.getElementById("timeStep").classList.remove("d-none");

    const backBtn = document.getElementById("schedulerBackBtn");
    const nextBtn = document.getElementById("schedulerNextBtn");

    backBtn.classList.remove("d-none");
    nextBtn.textContent = "Apply";
    nextBtn.disabled = false;

    syncSchedulerDateLabel();
    prefillTimeInputsIfChosen();
}

function updateReservationSummary() {
    const summary = document.getElementById("reservationSummary");
    if (!schedulerState.startDateTime || !schedulerState.endDateTime) {
        summary.textContent = "No date and time selected yet.";
        summary.classList.add("text-muted");
        return;
    }

    const start = schedulerState.startDateTime;
    const end = schedulerState.endDateTime;
    summary.textContent = `${start.toLocaleDateString()} · ${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")} to ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
    summary.classList.remove("text-muted");
}

function formatDateLocal(dt) {
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatTimeLocal(dt) {
    const hour = String(dt.getHours()).padStart(2, "0");
    const minute = String(dt.getMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
}

function syncManualInputsFromState() {
    const manualDateInput = document.getElementById("manualDate");
    const manualStartInput = document.getElementById("manualStartTime");
    const manualEndInput = document.getElementById("manualEndTime");

    manualDateInput.value = schedulerState.startDateTime ? formatDateLocal(schedulerState.startDateTime) : "";
    manualStartInput.value = schedulerState.startDateTime ? formatTimeLocal(schedulerState.startDateTime) : "";
    manualEndInput.value = schedulerState.endDateTime ? formatTimeLocal(schedulerState.endDateTime) : "";
}

function buildDateTimeFromDateAndTime(dateValue, timeValue) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);

    if ([year, month, day, hour, minute].some(Number.isNaN)) {
        return null;
    }

    return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function applyManualDateTimeInputs() {
    const manualDateInput = document.getElementById("manualDate");
    const manualStartInput = document.getElementById("manualStartTime");
    const manualEndInput = document.getElementById("manualEndTime");

    if (!manualDateInput.value || !manualStartInput.value || !manualEndInput.value) {
        return true;
    }

    const start = buildDateTimeFromDateAndTime(manualDateInput.value, manualStartInput.value);
    const end = buildDateTimeFromDateAndTime(manualDateInput.value, manualEndInput.value);

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        alert("Please enter valid date and time values.");
        return false;
    }

    if (end <= start) {
        alert("End time must be after start time.");
        return false;
    }

    schedulerState.startDateTime = start;
    schedulerState.endDateTime = end;
    schedulerState.selectedDate = new Date(start);
    schedulerState.selectedDate.setHours(0, 0, 0, 0);
    updateReservationSummary();
    return true;
}

function applyTimeSelection() {
    const start = getSelectedDateTimeFromInputs("start");
    const end = getSelectedDateTimeFromInputs("end");

    if (!start || !end) {
        alert("Please choose reservation date and times.");
        return false;
    }

    if (end <= start) {
        alert("End time must be after start time.");
        return false;
    }

    schedulerState.startDateTime = start;
    schedulerState.endDateTime = end;
    updateReservationSummary();
    syncManualInputsFromState();
    schedulerState.modal.hide();
    return true;
}

function initSchedulerModal() {
    initTimeSelectOptions();

    schedulerState.modal = new bootstrap.Modal(document.getElementById("schedulerModal"));

    schedulerState.calendar = flatpickr("#calendarContainer", {
        inline: true,
        minDate: "today",
        dateFormat: "Y-m-d",
        onChange(selectedDates) {
            schedulerState.selectedDate = selectedDates[0] || null;
            document.getElementById("schedulerNextBtn").disabled = !schedulerState.selectedDate;
        }
    });

    document.getElementById("openSchedulerBtn").addEventListener("click", () => {
        showCalendarStep();
        schedulerState.modal.show();
    });

    document.getElementById("schedulerBackBtn").addEventListener("click", showCalendarStep);

    document.getElementById("schedulerNextBtn").addEventListener("click", () => {
        const title = document.getElementById("schedulerTitle").textContent;
        if (title === "Choose reservation date") {
            showTimeStep();
        } else {
            applyTimeSelection();
        }
    });

    document.getElementById("manualDate").addEventListener("change", () => {
        applyManualDateTimeInputs();
    });

    document.getElementById("manualStartTime").addEventListener("change", () => {
        applyManualDateTimeInputs();
    });

    document.getElementById("manualEndTime").addEventListener("change", () => {
        applyManualDateTimeInputs();
    });

    updateReservationSummary();
}

const roomNameByID = new Map();

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

    roomNameByID.clear();
    rooms.forEach(room => {
        roomNameByID.set(Number(room.id), room.name);

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
            <td>${r.room_name || r.room || roomNameByID.get(Number(r.room_id)) || `Room #${r.room_id}`}</td>
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

    if (!applyManualDateTimeInputs()) {
        return;
    }

    const roomID = document.getElementById("roomSelect").value;
    const startTime = schedulerState.startDateTime;
    const endTime = schedulerState.endDateTime;

    if (!startTime || !endTime) {
        alert("Please choose date and times first.");
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

    syncManualInputsFromState();
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

    initSchedulerModal();
    fetchRooms();
    fetchReservations();

    document.getElementById("reservationForm").addEventListener("submit", createReservation);
}

window.addEventListener("DOMContentLoaded", initDashboard);
