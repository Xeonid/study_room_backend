function updateReservationFormMode() {
    const notice = document.getElementById("reservationEditNotice");
    const submitBtn = document.getElementById("reservationSubmitBtn");
    const deleteBtn = document.getElementById("reservationDeleteEditBtn");
    const cancelBtn = document.getElementById("reservationCancelEditBtn");
    if (!notice || !submitBtn || !deleteBtn || !cancelBtn) return;

    const isEditing = editingReservationID !== null;
    notice.classList.toggle("d-none", !isEditing);
    deleteBtn.classList.toggle("d-none", !isEditing);
    cancelBtn.classList.toggle("d-none", !isEditing);
    submitBtn.textContent = isEditing ? "Save Reservation" : "Reserve Room";
}

function resetReservationFormMode() {
    editingReservationID = null;
    updateReservationFormMode();
}

function beginReservationEdit(reservationID) {
    const reservation = reservationsCache.find(item => Number(item.id) === Number(reservationID));
    if (!reservation) {
        alert("Reservation not found.");
        return;
    }

    editingReservationID = Number(reservationID);
    document.getElementById("attendeeCount").value = String(reservation.attendee_count || 1);
    setRoomSelectionByID(Number(reservation.room_id));

    const start = new Date(reservation.start_time);
    const end = new Date(reservation.end_time);
    schedulerState.startDateTime = start;
    schedulerState.endDateTime = end;
    schedulerState.selectedDate = new Date(start);
    schedulerState.selectedDate.setHours(0, 0, 0, 0);
    syncManualInputsFromState();
    updateReservationSummary();
    updateReservationFormMode();
    refreshAvailableRooms().catch(err => {
        setRoomAvailabilityHint(String(err.message || err), true);
    });
    openReserveTab();
}

function populateRoomSelect(rooms, attendeeCount = 0) {
    const select = document.getElementById("roomSelect");
    if (!select) return;

    const previousValue = select.value;
    select.innerHTML = "";

    if (!Array.isArray(rooms) || rooms.length === 0) {
        select.appendChild(createOption("", "No rooms available for this group and time"));
        select.value = "";
        setRoomAvailabilityHint(`No rooms can fit ${attendeeCount || "this"} attendee requirement for the selected time.`, true);
        setAvailabilityFeedback("danger", "No rooms can satisfy this reservation right now. Adjust the time or reduce the group size.");
        return;
    }

    let fittingRoomCount = 0;
    rooms.forEach(room => {
        const option = document.createElement("option");
        option.value = room.id;
        // The availability endpoint can return rooms that should stay visible but not selectable.
        const availableCapacity = Number(room.available_capacity ?? room.capacity ?? 0);
        const fitsRequiredCapacity = room.fits_required_capacity !== false && availableCapacity >= attendeeCount;
        if (fitsRequiredCapacity) {
            fittingRoomCount += 1;
        } else {
            option.disabled = true;
        }
        const capacityLabel = availableCapacity > 0
            ? `${availableCapacity}/${room.capacity} seats available`
            : `full for this slot (${room.capacity} total)`;
        const fitLabel = fitsRequiredCapacity ? "" : " - too small for this group";
        const noteLabel = room.note ? ` - ${room.note}` : "";
        option.textContent = `${room.name} (${capacityLabel})${fitLabel}${noteLabel}`;
        select.appendChild(option);
    });

    if (fittingRoomCount === 0) {
        const placeholder = createOption("", "No rooms currently fit this reservation");
        placeholder.selected = true;
        select.insertBefore(placeholder, select.firstChild);
        select.value = "";
        setRoomAvailabilityHint(`No rooms can fit ${attendeeCount || "this"} attendee requirement for the selected time.`, true);
        setAvailabilityFeedback("danger", "All rooms are full or too small for the selected time window.");
        return;
    }

    const hasPrevious = rooms.some(room => String(room.id) === String(previousValue) && room.fits_required_capacity !== false);
    const firstFittingRoom = rooms.find(room => room.fits_required_capacity !== false);
    select.value = hasPrevious ? previousValue : String(firstFittingRoom?.id ?? "");
    setRoomAvailabilityHint(`${fittingRoomCount} room${fittingRoomCount === 1 ? "" : "s"} fit this reservation. Disabled options do not have enough seats.`);
    if (fittingRoomCount === 1) {
        setAvailabilityFeedback("success", "1 room currently fits this reservation.");
    } else {
        setAvailabilityFeedback("info", `${fittingRoomCount} rooms currently fit this reservation.`);
    }
}

async function fetchAllRooms() {
    const token = getToken();
    if (!token) return;

    const roomsURL = getStoredUserRole() === "admin" ? "/api/rooms?include_inactive=true" : "/api/rooms";
    const res = await fetch(roomsURL, {
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to load rooms");
    }

    const rooms = await writeJSON(res);
    roomNameByID.clear();
    roomDetailsByID.clear();
    if (!Array.isArray(rooms)) {
        return;
    }

    rooms.forEach(room => {
        roomNameByID.set(Number(room.id), room.name);
        roomDetailsByID.set(Number(room.id), room);
    });

    fillCalendarRoomFilterOptions();
    fillAdminReservationRoomFilter();
    renderAdminRoomPanel();
}

async function refreshAvailableRooms() {
    const token = getToken();
    if (!token) return;

    const params = getReservationSearchParams();
    if (!params) {
        populateRoomSelect([]);
        setRoomAvailabilityHint("Enter a valid group size, date, and time to load matching rooms.", true);
        setAvailabilityFeedback("secondary", "Select a valid date, start time, end time, and group size to preview availability.");
        return;
    }

    if (!params.startTime || !params.endTime) {
        const rooms = Array.from(roomDetailsByID.values())
            // Admin views still manage inactive rooms elsewhere, but reservations should never offer them.
            .filter(room => room.is_active !== false)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map(room => ({
                ...room,
                available_capacity: room.capacity,
                fits_required_capacity: Number(room.capacity) >= params.attendeeCount
            }));
        populateRoomSelect(rooms, params.attendeeCount);
        setRoomAvailabilityHint("Choose date and time to see live remaining seats for each room.");
        if (params.attendeeCount > 1) {
            setAvailabilityFeedback("secondary", "Group size is set. Choose a date and time to calculate live availability.");
        }
        return;
    }

    // Keep undersized/full rooms in the list so users can see why a room is unavailable for this slot.
    const query = new URLSearchParams({
        start_time: params.startTime.toISOString(),
        end_time: params.endTime.toISOString(),
        required_capacity: String(params.attendeeCount),
        include_unavailable: "true"
    });
    if (editingReservationID !== null) {
        query.set("exclude_reservation_id", String(editingReservationID));
    }
    const res = await fetch(`/api/rooms?${query.toString()}`, {
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to load room availability");
    }

    const rooms = await writeJSON(res);
    populateRoomSelect(Array.isArray(rooms) ? rooms : [], params.attendeeCount);
}

// -------------------- Fetch Reservations --------------------
async function fetchReservations() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/reservations", {
        headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) {
        const err = await res.text();
        alert("Failed to load reservations: " + err);
        return;
    }

    const data = await writeJSON(res);
    reservationsCache = Array.isArray(data) ? data : [];
    const tbody = document.querySelector("#reservationsTable tbody");
    if (tbody) {
        tbody.innerHTML = "";
    }

    if (roomNameByID.size === 0) {
        await fetchAllRooms();
    }

    if (!data || data.length === 0) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">No reservations yet</td></tr>`;
        }
        renderBookingListing();
        renderReservationCalendar();
        return;
    }

    if (tbody) {
        data.forEach(r => {
            const tr = document.createElement("tr");
            const capacityText = Number(r.attendee_count) > 0
                ? `<div class="small text-muted">Group size: ${r.attendee_count}</div>`
                : "";
            tr.innerHTML = `
                <td>${r.id}</td>
                <td>${r.room_name || r.room || roomNameByID.get(Number(r.room_id)) || `Room #${r.room_id}`}${capacityText}</td>
                <td>${formatDisplayDateTime(new Date(r.start_time))}</td>
                <td>${formatDisplayDateTime(new Date(r.end_time))}</td>
                <td>${r.status}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteReservation(${r.id})">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderBookingListing();
    renderReservationCalendar();
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
    const attendeeCount = Number(document.getElementById("attendeeCount").value);
    const startTime = schedulerState.startDateTime;
    const endTime = schedulerState.endDateTime;

    if (!Number.isInteger(attendeeCount) || attendeeCount <= 0) {
        alert("Please enter a valid group size.");
        return;
    }
    if (!roomID) {
        alert("No room is currently available for that reservation.");
        return;
    }
    if (!startTime || !endTime) {
        alert("Please choose date and times first.");
        return;
    }

    const isEditing = editingReservationID !== null;
    const endpoint = isEditing ? `/api/reservations?id=${editingReservationID}` : "/api/reservations";
    const res = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            room_id: Number(roomID),
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            attendee_count: attendeeCount
        })
    });

    if (!res.ok) {
        const err = await res.text();
        showToast(
            `Failed to ${isEditing ? "update" : "create"} reservation: ${err}`,
            "danger",
            "reservationActionToast",
            "reservationActionToastBody"
        );
        return;
    }

    showToast(isEditing ? "Reservation updated." : "Reservation created.", "success", "reservationActionToast", "reservationActionToastBody");
    syncManualInputsFromState();
    resetReservationFormMode();
    await fetchReservations();
    await refreshAvailableRooms();
    if (!isEditing) {
        window.setTimeout(openCalendarTab, 900);
    }
}

// -------------------- Delete Reservation --------------------
async function deleteReservation(resID, options = {}) {
    const token = getToken();
    if (!token) return;
    if (!Number.isInteger(Number(resID))) {
        alert("Invalid reservation ID.");
        return;
    }
    const confirmationMessage = options.confirmationMessage || "Delete this booking?";
    if (!window.confirm(confirmationMessage)) {
        return;
    }

    const res = await fetch(`/api/reservations?id=${resID}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) {
        const err = await res.text();
        showToast(
            `Failed to delete reservation: ${err}`,
            "danger",
            options.toastID || "actionToast",
            options.toastBodyID || "actionToastBody"
        );
        return;
    }

    if (options.resetEditMode) {
        resetReservationFormMode();
    }
    showToast(
        "Reservation deleted.",
        "success",
        options.toastID || "actionToast",
        options.toastBodyID || "actionToastBody"
    );
    await fetchReservations();
    await refreshAvailableRooms();
}
