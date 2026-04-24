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

function clearReservationDraftSelection() {
    schedulerState.selectedDate = null;
    schedulerState.startDateTime = null;
    schedulerState.endDateTime = null;
    syncManualInputsFromState();
    updateReservationSummary();
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

function renderReservationLimits(limits) {
    const rulesHost = document.getElementById("reservationLimitRules");
    const currentHost = document.getElementById("reservationLimitCurrent");
    const projectedHost = document.getElementById("reservationLimitProjected");
    const statusHost = document.getElementById("reservationLimitStatus");
    if (!rulesHost || !currentHost || !projectedHost || !statusHost) return;

    if (!limits || !limits.rules || !limits.current) {
        rulesHost.innerHTML = `<li class="text-muted">Reservation limits unavailable.</li>`;
        currentHost.innerHTML = `<div class="text-muted">Unable to load your current usage.</div>`;
        projectedHost.innerHTML = `<div class="text-muted">Choose a date and time to preview the effect of a new reservation.</div>`;
        statusHost.className = "alert alert-secondary py-2 px-3 mb-0";
        statusHost.textContent = "Choose a valid date and time to preview reservation limits.";
        return;
    }

    if (limits.rules.applies === false) {
        rulesHost.innerHTML = `<li>Admin reservations are not subject to student reservation limits.</li>`;
        currentHost.innerHTML = `<div>Admin role detected. Daily, weekly, and gap limits are not enforced.</div>`;
        projectedHost.innerHTML = `<div>The selected reservation will be checked for room capacity only.</div>`;
        statusHost.className = "alert alert-secondary py-2 px-3 mb-0";
        statusHost.textContent = "Admin reservations bypass student reservation limits.";
        return;
    }

    rulesHost.innerHTML = `
        <li>Future reservations only</li>
        <li>Reservations allowed up to ${escapeHTML(String(limits.rules.max_lead_time_days || 14))} days ahead</li>
        <li>Hours allowed: ${escapeHTML(String(limits.rules.earliest_hour || "08:00"))} to ${escapeHTML(String(limits.rules.latest_hour || "20:00"))}</li>
        <li>Maximum ${escapeHTML(String(limits.rules.max_reservations_per_day || 2))} reservations per day</li>
        <li>Maximum ${escapeHTML(String(limits.rules.max_hours_per_week || 20))} hours per week</li>
        <li>Maximum ${escapeHTML(String(limits.rules.max_upcoming_reservations || 5))} upcoming reservations at once</li>
        <li>Only one reservation at a time per student across all rooms</li>
        <li>Minimum ${escapeHTML(String(limits.rules.minimum_gap_minutes || 15))} minutes between reservations</li>
        <li>No edits or cancellations after start time or within ${escapeHTML(String(limits.rules.change_cutoff_minutes || 15))} minutes of start</li>
        <li>Confirmation required before saving</li>
    `;

    currentHost.innerHTML = `
        <div><strong>Today:</strong> ${usageNumber(limits.current.reservations_today || 0)} used, ${usageNumber(limits.current.reservations_today_remaining || 0)} remaining</div>
        <div><strong>This week:</strong> ${usageNumber(limits.current.hours_this_week || 0, "h")} used, ${usageNumber(limits.current.hours_this_week_remaining || 0, "h")} remaining</div>
        <div><strong>Upcoming:</strong> ${usageNumber(limits.current.upcoming_reservations || 0)} held, ${usageNumber(limits.current.upcoming_reservations_remaining || 0)} remaining</div>
    `;

    if (!limits.proposed) {
        projectedHost.innerHTML = `<div class="text-muted">Choose a date and time to preview the effect of this reservation.</div>`;
        statusHost.className = "alert alert-secondary py-2 px-3 mb-0";
        statusHost.textContent = "Choose a valid date and time to preview reservation limits.";
        return;
    }

    const violations = Array.isArray(limits.proposed.violations) ? limits.proposed.violations : [];
    projectedHost.innerHTML = `
        <div><strong>Selected day after booking:</strong> ${escapeHTML(String(limits.proposed.reservations_on_selected_day_after || 0))}/${escapeHTML(String(limits.rules.max_reservations_per_day || 2))}</div>
        <div><strong>Selected week after booking:</strong> ${escapeHTML(String(limits.proposed.hours_on_selected_week_after || 0))}h/${escapeHTML(String(limits.rules.max_hours_per_week || 20))}h</div>
        <div><strong>Upcoming after booking:</strong> ${escapeHTML(String(limits.proposed.upcoming_reservations_after || 0))}/${escapeHTML(String(limits.rules.max_upcoming_reservations || 5))}</div>
        <div><strong>Reservation duration:</strong> ${escapeHTML(String(limits.proposed.duration_hours || 0))}h</div>
    `;

    if (limits.proposed.can_reserve) {
        statusHost.className = "alert alert-secondary py-2 px-3 mb-0";
        statusHost.textContent = "Projected usage is shown below.";
        return;
    }

    statusHost.className = "alert alert-danger py-2 px-3 mb-0";
    statusHost.textContent = violations.length > 0
        ? violations.join(" ")
        : "This slot does not satisfy the reservation limits.";
}

function usageValueClass(value) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
        return numericValue === 0 ? "is-zero" : "is-positive";
    }
    return "is-positive";
}

function usageMetaClass(value) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
        return numericValue === 0 ? "is-zero" : "is-positive";
    }
    return "";
}

function usageNumber(value, suffix = "") {
    return `<span class="${usageMetaClass(value)}">${escapeHTML(String(value))}${escapeHTML(suffix)}</span>`;
}

function renderDashboardUsageStats(limits) {
    const host = document.getElementById("dashboardUsageStats");
    if (!host) return;

    if (!limits || !limits.rules || !limits.current) {
        host.innerHTML = `
            <div class="usage-stat-card">
                <div class="usage-stat-label">Usage</div>
                <div class="usage-stat-value">Unavailable</div>
                <div class="usage-stat-meta">Current reservation stats could not be loaded.</div>
            </div>
        `;
        return;
    }

    if (limits.rules.applies === false) {
        host.innerHTML = `
            <div class="usage-stat-card">
                <div class="usage-stat-label">Role</div>
                <div class="usage-stat-value">Admin</div>
                <div class="usage-stat-meta">Student reservation limits do not apply.</div>
            </div>
            <div class="usage-stat-card">
                <div class="usage-stat-label">Daily Limit</div>
                <div class="usage-stat-value">Exempt</div>
                <div class="usage-stat-meta">No reservation count cap for admins.</div>
            </div>
            <div class="usage-stat-card">
                <div class="usage-stat-label">Weekly Hours</div>
                <div class="usage-stat-value">Exempt</div>
                <div class="usage-stat-meta">No weekly hour cap for admins.</div>
            </div>
            <div class="usage-stat-card">
                <div class="usage-stat-label">Policy</div>
                <div class="usage-stat-value">Capacity Only</div>
                <div class="usage-stat-meta">Reservations still check room availability and capacity.</div>
            </div>
        `;
        return;
    }

    host.innerHTML = `
        <div class="usage-stat-card">
            <div class="usage-stat-label">Reservations Today</div>
            <div class="usage-stat-value ${usageValueClass(limits.current.reservations_today || 0)}">${escapeHTML(String(limits.current.reservations_today || 0))}</div>
            <div class="usage-stat-meta ${usageMetaClass(limits.current.reservations_today_remaining || 0)}">${escapeHTML(String(limits.current.reservations_today_remaining || 0))} remaining today</div>
        </div>
        <div class="usage-stat-card">
            <div class="usage-stat-label">Hours This Week</div>
            <div class="usage-stat-value ${usageValueClass(limits.current.hours_this_week || 0)}">${escapeHTML(String(limits.current.hours_this_week || 0))}h</div>
            <div class="usage-stat-meta ${usageMetaClass(limits.current.hours_this_week_remaining || 0)}">${escapeHTML(String(limits.current.hours_this_week_remaining || 0))}h remaining this week</div>
        </div>
        <div class="usage-stat-card">
            <div class="usage-stat-label">Daily Limit</div>
            <div class="usage-stat-value ${usageValueClass(limits.rules.max_reservations_per_day || 2)}">${escapeHTML(String(limits.rules.max_reservations_per_day || 2))}</div>
            <div class="usage-stat-meta">Maximum reservations allowed per day</div>
        </div>
        <div class="usage-stat-card">
            <div class="usage-stat-label">Upcoming Held</div>
            <div class="usage-stat-value ${usageValueClass(limits.current.upcoming_reservations || 0)}">${escapeHTML(String(limits.current.upcoming_reservations || 0))}</div>
            <div class="usage-stat-meta ${usageMetaClass(limits.current.upcoming_reservations_remaining || 0)}">${escapeHTML(String(limits.current.upcoming_reservations_remaining || 0))} of ${escapeHTML(String(limits.rules.max_upcoming_reservations || 5))} remaining</div>
        </div>
    `;
}

async function fetchReservationLimitsData() {
    const token = getToken();
    if (!token) return null;

    const params = getReservationSearchParams();
    const query = new URLSearchParams();
    if (params?.startTime && params?.endTime) {
        query.set("start_time", params.startTime.toISOString());
        query.set("end_time", params.endTime.toISOString());
    }
    if (editingReservationID !== null) {
        query.set("exclude_reservation_id", String(editingReservationID));
    }

    const url = query.toString() ? `/api/reservations/limits?${query.toString()}` : "/api/reservations/limits";
    const res = await fetch(url, {
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to load reservation limits");
    }

    return await writeJSON(res);
}

async function refreshReservationLimits() {
    try {
        const limits = await fetchReservationLimitsData();
        renderDashboardUsageStats(limits);
        renderReservationLimits(limits);
        return limits;
    } catch (err) {
        renderDashboardUsageStats(null);
        renderReservationLimits(null);
        const statusHost = document.getElementById("reservationLimitStatus");
        if (statusHost) {
            statusHost.className = "alert alert-danger py-2 px-3 mb-0";
            statusHost.textContent = String(err.message || err);
        }
        return null;
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
    refreshReservationLimits().catch(() => {});

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
        await refreshReservationLimits();
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
    await refreshReservationLimits();
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
    const limits = await fetchReservationLimitsData().catch(() => null);
    if (limits?.proposed?.can_reserve === false) {
        const violations = Array.isArray(limits.proposed.violations) ? limits.proposed.violations.join(" ") : "This slot does not satisfy the reservation limits.";
        showToast(violations, "danger", "reservationActionToast", "reservationActionToastBody");
        return;
    }

    const selectedRoomName = roomNameByID.get(Number(roomID)) || document.getElementById("roomSelect")?.selectedOptions?.[0]?.textContent || `Room #${roomID}`;
    const projectedDayAfter = limits?.proposed?.reservations_on_selected_day_after;
    const projectedWeekAfter = limits?.proposed?.hours_on_selected_week_after;
    const confirmationMessage = [
        `${isEditing ? "Save" : "Confirm"} this reservation?`,
        `Room: ${selectedRoomName}`,
        `Time: ${formatDisplayDateTime(startTime)} to ${formatDisplayDateTime(endTime)}`,
        `Group size: ${attendeeCount}`,
        Number.isFinite(Number(projectedDayAfter)) ? `Reservations on selected day after save: ${projectedDayAfter}/${limits?.rules?.max_reservations_per_day || 2}` : "",
        Number.isFinite(Number(projectedWeekAfter)) ? `Hours on selected week after save: ${projectedWeekAfter}h/${limits?.rules?.max_hours_per_week || 20}h` : ""
    ].filter(Boolean).join("\n");
    if (!window.confirm(confirmationMessage)) {
        return;
    }

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
            attendee_count: attendeeCount,
            confirm: true
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
    clearReservationDraftSelection();
    resetReservationFormMode();
    await fetchReservations();
    await refreshReservationLimits();
    if (!isEditing) {
        window.setTimeout(openCalendarTab, 2000);
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
