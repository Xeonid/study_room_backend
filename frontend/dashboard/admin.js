// -------------------- Fetch Rooms --------------------
function getReservationSearchParams() {
    if (!applyManualDateTimeInputs()) {
        return null;
    }

    const attendeeInput = document.getElementById("attendeeCount");
    const attendeeCount = Number(attendeeInput?.value || 0);
    if (!Number.isInteger(attendeeCount) || attendeeCount <= 0) {
        return null;
    }

    if (!schedulerState.startDateTime || !schedulerState.endDateTime) {
        return {
            attendeeCount,
            startTime: null,
            endTime: null
        };
    }

    return {
        attendeeCount,
        startTime: schedulerState.startDateTime,
        endTime: schedulerState.endDateTime
    };
}

function setRoomAvailabilityHint(message, isError = false) {
    const hint = document.getElementById("roomAvailabilityHint");
    if (!hint) return;

    hint.textContent = message;
    hint.classList.toggle("text-danger", isError);
    hint.classList.toggle("text-muted", !isError);
}

function setAvailabilityFeedback(variant, message) {
    availabilityFeedbackState.variant = variant;
    availabilityFeedbackState.message = message;

    const host = document.getElementById("roomAvailabilityFeedback");
    const body = document.getElementById("roomAvailabilityFeedbackBody");
    if (!host || !body) return;

    host.classList.remove("d-none");
    body.className = `alert alert-${variant} py-2 px-3 mb-0`;
    body.textContent = message;
}

function updateAdminRoomFormMode() {
    const submitBtn = document.getElementById("adminRoomSubmitBtn");
    if (!submitBtn) return;
    submitBtn.textContent = "Create Room";
}

function resetAdminRoomForm() {
    editingRoomID = null;
    const form = document.getElementById("adminRoomForm");
    if (form) form.reset();
    const activeInput = document.getElementById("adminRoomIsActive");
    if (activeInput) activeInput.checked = true;
    updateAdminRoomFormMode();
}

function getFilteredAdminRooms() {
    const query = adminRoomSearchQuery.trim().toLowerCase();
    const rooms = Array.from(roomDetailsByID.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!query) {
        return rooms;
    }

    return rooms.filter(room => {
        const haystack = [
            room.name,
            room.note,
            room.deactivation_reason,
            room.is_active ? "active" : "inactive"
        ].join(" ").toLowerCase();
        return haystack.includes(query);
    });
}

function adminRoomStatusHTML(room) {
    const isActive = Boolean(room.is_active);
    const reason = String(room.deactivation_reason || "").trim();
    const upcomingCount = Number(room.upcoming_reservations || 0);
    const badgeClass = isActive ? "text-bg-success" : "text-bg-secondary";
    const warningHTML = !isActive && upcomingCount > 0
        ? `<div class="small text-danger fw-semibold mt-1">Inactive with ${upcomingCount} upcoming booking${upcomingCount === 1 ? "" : "s"}.</div>`
        : "";
    const reasonHTML = !isActive && reason
        ? `<div class="small text-muted mt-1">${escapeHTML(reason)}</div>`
        : (!isActive ? `<div class="small text-muted mt-1">No reason added.</div>` : "");
    return `
        <span class="badge ${badgeClass}">${isActive ? "Active" : "Inactive"}</span>
        ${reasonHTML}
        ${warningHTML}
    `;
}

function adminRoomSummaryHTML(room) {
    return `
        <div class="small">Available now: <span class="fw-semibold">${Number(room.available_capacity ?? room.capacity ?? 0)}</span></div>
        <div class="small text-muted">Active now: ${Number(room.active_now_reservations || 0)} | Today: ${Number(room.reservations_today || 0)} | Upcoming: ${Number(room.upcoming_reservations || 0)} | Week: ${Number(room.reservations_this_week || 0)}</div>
    `;
}

function renderAdminRoomPanel() {
    const adminTabItem = document.getElementById("admin-tab-item");
    const adminTab = document.getElementById("admin-tab");
    const panel = document.getElementById("adminRoomPanel");
    const reservationsPanel = document.getElementById("adminReservationsPanel");
    const roomsViewBtn = document.getElementById("adminRoomsViewBtn");
    const reservationsViewBtn = document.getElementById("adminReservationsViewBtn");
    const rowsHost = document.getElementById("adminRoomRows");
    if (!panel || !rowsHost || !adminTabItem || !adminTab || !reservationsPanel || !roomsViewBtn || !reservationsViewBtn) return;

    const isAdmin = getStoredUserRole() === "admin";
    adminTabItem.classList.toggle("d-none", !isAdmin);
    adminTab.classList.toggle("d-none", !isAdmin);
    if (!isAdmin) {
        // Hide the admin pane even if the markup is present; backend handlers still enforce the real permission check.
        const activeAdminTab = document.getElementById("admin-tab-btn");
        if (activeAdminTab?.classList.contains("active")) {
            const dashboardTabBtn = document.getElementById("dashboard-tab-btn");
            if (dashboardTabBtn) {
                if (typeof bootstrap !== "undefined" && typeof bootstrap.Tab === "function") {
                    bootstrap.Tab.getOrCreateInstance(dashboardTabBtn).show();
                } else {
                    dashboardTabBtn.click();
                }
            }
        }
        return;
    }

    panel.classList.toggle("d-none", adminViewMode !== "rooms");
    reservationsPanel.classList.toggle("d-none", adminViewMode !== "reservations");
    roomsViewBtn.className = adminViewMode === "rooms" ? "btn btn-primary btn-sm" : "btn btn-outline-primary btn-sm";
    reservationsViewBtn.className = adminViewMode === "reservations" ? "btn btn-primary btn-sm" : "btn btn-outline-primary btn-sm";

    const rooms = getFilteredAdminRooms();
    if (rooms.length === 0) {
        rowsHost.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No rooms loaded.</td></tr>`;
        refreshSyncedHorizontalScrollbars();
        return;
    }

    rowsHost.innerHTML = rooms.map(room => {
        const isEditing = editingRoomID === Number(room.id);
        if (isEditing) {
            return `
        <tr>
            <td><input class="form-control" id="inlineRoomName-${room.id}" type="text" value="${escapeHTML(String(room.name || ""))}"></td>
            <td><input class="form-control" id="inlineRoomCapacity-${room.id}" type="number" min="1" step="1" value="${Number(room.capacity || 0)}"></td>
            <td><input class="form-control" id="inlineRoomNote-${room.id}" type="text" maxlength="160" value="${escapeHTML(String(room.note || ""))}"></td>
            <td>
                <div class="form-check mb-2">
                    <input class="form-check-input" id="inlineRoomActive-${room.id}" type="checkbox" ${room.is_active ? "checked" : ""}>
                    <label class="form-check-label" for="inlineRoomActive-${room.id}">Active</label>
                </div>
                <input class="form-control" id="inlineRoomDeactivationReason-${room.id}" type="text" maxlength="160" placeholder="Deactivation reason" value="${escapeHTML(String(room.deactivation_reason || ""))}">
            </td>
            <td>${adminRoomSummaryHTML(room)}</td>
            <td class="text-end">
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-primary js-admin-room-save" type="button" data-room-id="${room.id}">Save</button>
                    <button class="btn btn-outline-secondary js-admin-room-cancel" type="button">Cancel</button>
                </div>
            </td>
        </tr>
    `;
        }

        return `
        <tr>
            <td>${escapeHTML(String(room.name || ""))}</td>
            <td>${Number(room.capacity || 0)}</td>
            <td>${escapeHTML(String(room.note || "")) || '<span class="text-muted">-</span>'}</td>
            <td>${adminRoomStatusHTML(room)}</td>
            <td>${adminRoomSummaryHTML(room)}</td>
            <td class="text-end">
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-outline-primary btn-sm js-admin-room-edit" type="button" data-room-id="${room.id}">Edit</button>
                    ${room.is_active ? `<button class="btn btn-outline-warning btn-sm js-admin-room-deactivate" type="button" data-room-id="${room.id}">Deactivate</button>` : ""}
                    <button class="btn btn-outline-danger btn-sm js-admin-room-delete" type="button" data-room-id="${room.id}">Delete</button>
                </div>
            </td>
        </tr>
    `;
    }).join("");
    refreshSyncedHorizontalScrollbars();
}

function fillAdminReservationRoomFilter() {
    const select = document.getElementById("adminReservationRoomFilter");
    if (!select) return;

    const currentValue = select.value || adminReservationFilters.roomID;
    const rooms = Array.from(roomNameByID.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    select.innerHTML = `<option value="all">All rooms</option>`;
    rooms.forEach(([id, name]) => {
        const option = document.createElement("option");
        option.value = String(id);
        option.textContent = name;
        select.appendChild(option);
    });
    select.value = rooms.some(([id]) => String(id) === String(currentValue)) ? currentValue : "all";
}

function getFilteredAdminReservations() {
    const query = adminReservationFilters.userQuery.trim().toLowerCase();
    return adminReservationsCache.filter(reservation => {
        const searchText = [
            reservation.user_name,
            reservation.user_email,
            reservation.room_name,
            reservation.room,
            reservation.status
        ].join(" ").toLowerCase();
        if (query && !searchText.includes(query)) {
            return false;
        }
        if (adminReservationFilters.roomID !== "all" && String(reservation.room_id) !== String(adminReservationFilters.roomID)) {
            return false;
        }
        if (adminReservationFilters.date) {
            const startDate = new Date(reservation.start_time);
            const dayKey = Number.isNaN(startDate.getTime()) ? "" : toLocalDayKey(startDate);
            if (dayKey !== adminReservationFilters.date) {
                return false;
            }
        }
        return true;
    });
}

function syncAdminReservationFilterInputs() {
    const userFilter = document.getElementById("adminReservationUserFilter");
    const roomFilter = document.getElementById("adminReservationRoomFilter");
    const dateFilter = document.getElementById("adminReservationDateFilter");
    if (userFilter) userFilter.value = adminReservationFilters.userQuery;
    if (roomFilter) roomFilter.value = adminReservationFilters.roomID;
    if (dateFilter) dateFilter.value = adminReservationFilters.date;
}

function renderAdminReservations() {
    const rowsHost = document.getElementById("adminReservationRows");
    const summaryHost = document.getElementById("adminReservationSummary");
    const filterHint = document.getElementById("adminReservationFilterHint");
    if (!rowsHost) return;
    if (getStoredUserRole() !== "admin") return;

    const filtered = getFilteredAdminReservations();

    if (summaryHost) {
        const now = new Date();
        const todayKey = toLocalDayKey(now);
        const todayCount = filtered.filter(reservation => {
            const startDate = new Date(reservation.start_time);
            return !Number.isNaN(startDate.getTime()) && toLocalDayKey(startDate) === todayKey;
        }).length;
        const activeCount = filtered.filter(reservation => {
            const startDate = new Date(reservation.start_time);
            const endDate = new Date(reservation.end_time);
            return !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate <= now && endDate >= now;
        }).length;
        summaryHost.innerHTML = `
            <span class="badge text-bg-secondary">Total: ${filtered.length}</span>
            <span class="badge text-bg-secondary">Today: ${todayCount}</span>
            <span class="badge text-bg-secondary">Active: ${activeCount}</span>
        `;
    }
    if (filterHint) {
        const query = adminReservationFilters.userQuery.trim();
        if (query) {
            filterHint.textContent = `Search is filtering by: ${query}`;
            filterHint.classList.remove("d-none");
        } else {
            filterHint.textContent = "";
            filterHint.classList.add("d-none");
        }
    }

    if (filtered.length === 0) {
        rowsHost.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No reservations match the current filters.</td></tr>`;
        refreshSyncedHorizontalScrollbars();
        return;
    }

    rowsHost.innerHTML = filtered.map(reservation => `
        <tr>
            <td>
                <button class="btn btn-link p-0 text-start text-decoration-none fw-semibold js-admin-user-drilldown" type="button" data-user-query="${escapeHTML(reservation.user_email || reservation.user_name || "")}">${escapeHTML(reservation.user_name || "Unknown user")}</button>
                <div class="small text-muted">${escapeHTML(reservation.user_email || "")}</div>
            </td>
            <td>${escapeHTML(reservation.room_name || reservation.room || `Room #${reservation.room_id}`)}</td>
            <td>
                <div>${escapeHTML(formatDisplayDateTime(new Date(reservation.start_time)))}</div>
                <div class="small text-muted">to ${escapeHTML(formatDisplayDateTime(new Date(reservation.end_time)))}</div>
            </td>
            <td>${escapeHTML(String(reservation.attendee_count || ""))}</td>
            <td>${escapeHTML(String(reservation.status || ""))}</td>
            <td class="text-end">
                <button class="btn btn-outline-danger btn-sm js-admin-delete-reservation" type="button" data-reservation-id="${reservation.id}">Delete</button>
            </td>
        </tr>
    `).join("");
    refreshSyncedHorizontalScrollbars();
}

async function fetchAdminReservations() {
    const token = getToken();
    if (!token || getStoredUserRole() !== "admin") return;

    const res = await fetch("/api/admin/reservations", {
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to load admin reservations.", "danger");
        return;
    }

    const data = await writeJSON(res);
    adminReservationsCache = Array.isArray(data) ? data : [];
    renderAdminReservations();
}

function clearAdminReservationFilters() {
    adminReservationFilters.userQuery = "";
    adminReservationFilters.roomID = "all";
    adminReservationFilters.date = "";
    syncAdminReservationFilterInputs();
    renderAdminReservations();
}

function exportAdminReservationsCSV() {
    if (getStoredUserRole() !== "admin") return;

    const rows = getFilteredAdminReservations();
    if (rows.length === 0) {
        showToast("No reservations match the current filters.", "danger");
        return;
    }

    const lines = [
        ["Reservation ID", "User Name", "User Email", "Room", "Start Time", "End Time", "Group Size", "Status"]
            .map(csvEscape)
            .join(",")
    ];
    rows.forEach(reservation => {
        lines.push([
            reservation.id,
            reservation.user_name || "",
            reservation.user_email || "",
            reservation.room_name || reservation.room || `Room #${reservation.room_id}`,
            reservation.start_time,
            reservation.end_time,
            reservation.attendee_count || "",
            reservation.status || ""
        ].map(csvEscape).join(","));
    });

    // CSV export is generated client-side so it always reflects the currently applied admin filters.
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-reservations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Reservations exported.", "success");
}

function beginAdminRoomEdit(roomID) {
    const room = roomDetailsByID.get(Number(roomID));
    if (!room) {
        showToast("Room not found.", "danger");
        return;
    }

    editingRoomID = Number(roomID);
    renderAdminRoomPanel();
}

async function saveAdminRoom(event) {
    event.preventDefault();
    const token = getToken();
    if (!token || getStoredUserRole() !== "admin") return;

    const name = document.getElementById("adminRoomName").value.trim();
    const capacity = Number(document.getElementById("adminRoomCapacity").value);
    const note = document.getElementById("adminRoomNote").value.trim();
    const isActive = Boolean(document.getElementById("adminRoomIsActive").checked);
    if (!name || !Number.isInteger(capacity) || capacity <= 0) {
        showToast("Enter a valid room name and capacity.", "danger");
        return;
    }

    const endpoint = "/api/rooms/create";
    const method = "POST";
    const res = await fetch(endpoint, {
        method,
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, capacity, note, is_active: isActive, deactivation_reason: "" })
    });

    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to create room.", "danger");
        return;
    }

    showToast("Room created.", "success");
    resetAdminRoomForm();
    await fetchAllRooms();
    await refreshAvailableRooms();
}

async function saveInlineAdminRoom(roomID) {
    const token = getToken();
    if (!token || getStoredUserRole() !== "admin") return;

    const nameInput = document.getElementById(`inlineRoomName-${roomID}`);
    const capacityInput = document.getElementById(`inlineRoomCapacity-${roomID}`);
    const noteInput = document.getElementById(`inlineRoomNote-${roomID}`);
    const activeInput = document.getElementById(`inlineRoomActive-${roomID}`);
    const deactivationReasonInput = document.getElementById(`inlineRoomDeactivationReason-${roomID}`);
    if (!nameInput || !capacityInput || !noteInput || !activeInput || !deactivationReasonInput) return;

    const name = nameInput.value.trim();
    const capacity = Number(capacityInput.value);
    const note = noteInput.value.trim();
    const isActive = Boolean(activeInput.checked);
    const deactivationReason = isActive ? "" : deactivationReasonInput.value.trim();
    if (!name || !Number.isInteger(capacity) || capacity <= 0) {
        showToast("Enter a valid room name and capacity.", "danger");
        return;
    }

    const res = await fetch(`/api/rooms/update?id=${roomID}`, {
        method: "PUT",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, capacity, note, is_active: isActive, deactivation_reason: deactivationReason })
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to update room.", "danger");
        return;
    }

    editingRoomID = null;
    showToast("Room updated.", "success");
    await fetchAllRooms();
    await refreshAvailableRooms();
}

async function deleteAdminRoom(roomID) {
    const token = getToken();
    if (!token || getStoredUserRole() !== "admin") return;
    if (!window.confirm("Delete this room?")) {
        return;
    }

    const res = await fetch(`/api/rooms/delete?id=${roomID}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to delete room.", "danger");
        return;
    }

    if (editingRoomID === Number(roomID)) {
        resetAdminRoomForm();
    }
    showToast("Room deleted.", "success");
    await fetchAllRooms();
    await refreshAvailableRooms();
}

async function deactivateAdminRoom(roomID) {
    const token = getToken();
    if (!token || getStoredUserRole() !== "admin") return;

    const shouldDeactivate = window.confirm("Deactivate this room? It will stop appearing in booking options.");
    if (!shouldDeactivate) {
        return;
    }
    const cancelFuture = window.confirm("Also cancel future reservations for this room?");
    const reason = (window.prompt("Add an optional deactivation reason for admins and users.", "") || "").trim();

    const query = new URLSearchParams({ id: String(roomID) });
    const res = await fetch(`/api/rooms/deactivate?${query.toString()}`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ cancel_future: cancelFuture, reason })
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to deactivate room.", "danger");
        return;
    }

    const data = await writeJSON(res);
    const cancelledCount = Number(data?.cancelled_future_reservations || 0);
    const suffix = cancelFuture ? ` Cancelled future reservations: ${cancelledCount}.` : "";
    showToast(`Room deactivated.${suffix}`, "success");
    await fetchReservations();
    await fetchAdminReservations();
    await fetchAllRooms();
    await refreshAvailableRooms();
}

async function deleteAdminReservation(reservationID) {
    const token = getToken();
    if (!token || getStoredUserRole() !== "admin") return;
    if (!window.confirm("Delete this reservation?")) {
        return;
    }

    const res = await fetch(`/api/admin/reservations?id=${reservationID}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to delete reservation.", "danger");
        return;
    }

    showToast("Reservation deleted.", "success");
    await fetchReservations();
    await fetchAdminReservations();
    await refreshAvailableRooms();
}
