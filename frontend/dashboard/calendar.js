function isSmallScreenLayoutActive() {
    return window.innerWidth <= 768 || document.body.classList.contains("mobile-preview");
}

function syncTopScrollbar(topScrollbarID, scrollHostID) {
    const topScrollbar = document.getElementById(topScrollbarID);
    const scrollHost = document.getElementById(scrollHostID);
    if (!topScrollbar || !scrollHost) return;

    const inner = topScrollbar.querySelector(".top-scrollbar-inner");
    if (!inner) return;

    const target = scrollHost.querySelector("table");
    const targetWidth = target ? target.scrollWidth : scrollHost.scrollWidth;
    inner.style.width = `${targetWidth}px`;

    const shouldShow = isSmallScreenLayoutActive() && targetWidth > scrollHost.clientWidth + 4;
    topScrollbar.style.display = shouldShow ? "block" : "none";
}

function bindSyncedHorizontalScroll(topScrollbarID, scrollHostID) {
    const topScrollbar = document.getElementById(topScrollbarID);
    const scrollHost = document.getElementById(scrollHostID);
    if (!topScrollbar || !scrollHost || topScrollbar.dataset.syncBound === "true") return;

    let syncingTop = false;
    let syncingBottom = false;

    topScrollbar.addEventListener("scroll", () => {
        if (syncingBottom) {
            syncingBottom = false;
            return;
        }
        syncingTop = true;
        scrollHost.scrollLeft = topScrollbar.scrollLeft;
    });

    scrollHost.addEventListener("scroll", () => {
        if (syncingTop) {
            syncingTop = false;
            return;
        }
        syncingBottom = true;
        topScrollbar.scrollLeft = scrollHost.scrollLeft;
    });

    topScrollbar.dataset.syncBound = "true";
}

function refreshSyncedHorizontalScrollbars() {
    [
        ["bookingListTopScrollbar", "bookingListScrollHost"],
        ["adminRoomsTopScrollbar", "adminRoomsScrollHost"],
        ["adminReservationsTopScrollbar", "adminReservationsScrollHost"]
    ].forEach(([topID, hostID]) => syncTopScrollbar(topID, hostID));
}

function isReservationActive(event) {
    const normalized = normalizeStatus(event.status);
    if (normalized.includes("cancel")) return false;
    if (normalized.includes("active")) return true;

    const now = new Date();
    return event.endDate >= now;
}

function getReservationState(event) {
    const normalized = normalizeStatus(event.status);
    const now = new Date();

    // UI filters collapse raw backend statuses into a smaller set of user-facing states.
    if (normalized.includes("cancel")) return "cancelled";
    if (normalized.includes("pending")) return "pending";
    if (event.startDate <= now && event.endDate >= now) return "active_now";
    if (event.endDate < now) return "completed";
    if (normalized.includes("confirm")) return "upcoming";
    if (event.startDate > now) return "upcoming";
    return "default";
}

function eventTimeLabel(startDate, endDate) {
    const timeOptions = { hour: "2-digit", minute: "2-digit" };
    const startText = startDate.toLocaleTimeString([], timeOptions);
    const endText = endDate.toLocaleTimeString([], timeOptions);
    return `${startText} - ${endText}`;
}

function formatDisplayDate(date) {
    return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

function formatDisplayDateTime(date) {
    return `${formatDisplayDate(date)} ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    })}`;
}

function formatListingDate(date) {
    return formatDisplayDate(date);
}

function toReservationModel(reservation) {
    const startDate = new Date(reservation.start_time);
    const endDate = new Date(reservation.end_time);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return null;
    }

    return {
        id: reservation.id,
        roomID: Number(reservation.room_id),
        room: reservation.room_name || reservation.room || roomNameByID.get(Number(reservation.room_id)) || `Room #${reservation.room_id}`,
        status: reservation.status || "Other",
        attendeeCount: Number(reservation.attendee_count || 0),
        roomCapacity: Number(reservation.room_capacity || roomDetailsByID.get(Number(reservation.room_id))?.capacity || 0),
        startDate,
        endDate
    };
}

function getNormalizedReservations() {
    return reservationsCache
        .map(toReservationModel)
        .filter(Boolean);
}

function statusClassFromReservation(model) {
    const state = getReservationState(model);
    if (state === "active_now") return "status-active";
    if (state === "upcoming") return "status-confirmed";
    if (state === "pending") return "status-pending";
    if (state === "cancelled") return "status-cancelled";
    if (state === "completed") return "status-default";
    return "status-default";
}

function statusLabelFromReservation(model) {
    const state = getReservationState(model);
    if (state === "active_now") return "Active now";
    if (state === "upcoming") return "Upcoming";
    if (state === "pending") return "Pending";
    if (state === "cancelled") return "Cancelled";
    if (state === "completed") return "Completed";
    return model.status || "Other";
}

function isInDateFilter(model, dateFilter) {
    if (dateFilter === "all") return true;

    const now = new Date();
    const dayStart = new Date(model.startDate.getFullYear(), model.startDate.getMonth(), model.startDate.getDate(), 0, 0, 0, 0);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    if (dateFilter === "today") {
        return dayStart.getTime() === todayStart.getTime();
    }
    if (dateFilter === "this_week") {
        const weekStart = startOfWeek(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return dayStart >= weekStart && dayStart < weekEnd;
    }
    if (dateFilter === "this_month") {
        return model.startDate.getFullYear() === now.getFullYear() && model.startDate.getMonth() === now.getMonth();
    }
    return true;
}

function isInListingStatusFilter(model, statusFilter) {
    if (statusFilter === "any") return true;
    const state = getReservationState(model);
    if (statusFilter === "active") return state === "active_now" || state === "upcoming";
    if (statusFilter === "confirmed") return state === "upcoming";
    if (statusFilter === "pending") return state === "pending";
    if (statusFilter === "cancelled") return state === "cancelled";
    if (statusFilter === "other") {
        return state === "default" || state === "completed";
    }
    return true;
}

function isInRoomFilter(model) {
    if (!calendarRoomFilter || calendarRoomFilter === "all") return true;
    return String(model.roomID) === String(calendarRoomFilter);
}

function matchesListingSearch(model, rawSearch) {
    const search = String(rawSearch || "").trim().toLowerCase();
    if (!search) return true;

    return (
        String(model.id).includes(search) ||
        model.room.toLowerCase().includes(search) ||
        String(model.status || "").toLowerCase().includes(search) ||
        formatListingDate(model.startDate).includes(search)
    );
}

function sortListingRows(models, sortMode) {
    const clone = [...models];
    if (sortMode === "start_asc") {
        clone.sort((a, b) => a.startDate - b.startDate);
        return clone;
    }
    if (sortMode === "status") {
        clone.sort((a, b) => normalizeStatus(a.status).localeCompare(normalizeStatus(b.status)) || (b.startDate - a.startDate));
        return clone;
    }
    clone.sort((a, b) => b.startDate - a.startDate);
    return clone;
}

function renderBookingListing() {
    const rowsHost = document.getElementById("bookingListingRows");
    const countHost = document.getElementById("bookingListingCount");
    if (!rowsHost || !countHost) return;

    const filtered = sortListingRows(
        getNormalizedReservations().filter(model =>
            isInDateFilter(model, listingState.date) &&
            isInListingStatusFilter(model, listingState.status) &&
            isInRoomFilter(model) &&
            matchesListingSearch(model, listingState.search)
        ),
        listingState.sort
    );

    countHost.textContent = `${filtered.length} booking${filtered.length === 1 ? "" : "s"}`;

    if (filtered.length === 0) {
        rowsHost.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No reservations found for current filters.</td></tr>`;
        refreshSyncedHorizontalScrollbars();
        return;
    }

    rowsHost.innerHTML = filtered.map(model => `
        <tr>
            <td>
                <div class="booking-date-main">${formatListingDate(model.startDate)}</div>
                <div class="booking-time-main">${eventTimeLabel(model.startDate, model.endDate)}</div>
            </td>
            <td><span class="fw-semibold">${escapeHTML(model.room)}</span></td>
            <td><span class="status-pill ${statusClassFromReservation(model)}">${escapeHTML(statusLabelFromReservation(model))}</span></td>
            <td>
                <small class="text-muted">Starts ${escapeHTML(formatDisplayDateTime(model.startDate))}</small><br>
                <small class="text-muted">Ends ${escapeHTML(formatDisplayDateTime(model.endDate))}</small>
                ${model.attendeeCount > 0 ? `<br><small class="text-muted">Group size: ${model.attendeeCount}</small>` : ""}
            </td>
            <td class="text-end">
                <div class="dropdown">
                    <button class="btn btn-sm btn-light border" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><button class="dropdown-item js-edit-booking" type="button" data-reservation-id="${model.id}">Edit reservation</button></li>
                        <li><button class="dropdown-item text-danger js-delete-booking" type="button" data-reservation-id="${model.id}">Delete reservation</button></li>
                    </ul>
                </div>
            </td>
        </tr>
    `).join("");
    refreshSyncedHorizontalScrollbars();
}

function getDayEventsMap() {
    const map = new Map();
    getNormalizedReservations().forEach(eventModel => {
        const { startDate, endDate } = eventModel;

        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
        const adjustedEnd = new Date(endDate);
        // Midnight end times should remain visible on the previous day instead of spilling into the next day.
        if (
            adjustedEnd.getHours() === 0 &&
            adjustedEnd.getMinutes() === 0 &&
            adjustedEnd.getSeconds() === 0 &&
            adjustedEnd.getMilliseconds() === 0
        ) {
            adjustedEnd.setMilliseconds(adjustedEnd.getMilliseconds() - 1);
        }
        const lastDay = new Date(adjustedEnd.getFullYear(), adjustedEnd.getMonth(), adjustedEnd.getDate(), 0, 0, 0, 0);

        while (cursor <= lastDay) {
            const key = toLocalDayKey(cursor);
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(eventModel);
            cursor.setDate(cursor.getDate() + 1);
        }
    });

    map.forEach(events => {
        events.sort((a, b) => a.startDate - b.startDate);
    });

    return map;
}

function startOfWeek(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
}

function matchesStatusFilter(event) {
    const filter = String(calendarStatusFilter || "all").toLowerCase();
    const state = getReservationState(event);

    if (filter === "all") return true;
    if (filter === "active") return state === "active_now" || state === "upcoming";
    if (filter === "confirmed") return state === "upcoming";
    if (filter === "pending") return state === "pending";
    if (filter === "cancelled") return state === "cancelled";
    if (filter === "other") {
        return state === "default" || state === "completed";
    }
    return true;
}

function timelineStatusClass(event) {
    const state = getReservationState(event);
    if (state === "active_now") return "status-active";
    if (state === "upcoming") return "status-confirmed";
    if (state === "pending") return "status-pending";
    if (state === "cancelled") return "status-cancelled";
    if (state === "completed") return "status-default";
    return "status-default";
}

function isReservationOngoing(event) {
    const now = new Date();
    return event.startDate <= now && event.endDate >= now;
}

function openReserveTab() {
    const reserveTabBtn = document.getElementById("reserve-tab-btn");
    const reserveTab = document.getElementById("reserve-tab");
    if (!reserveTabBtn) return;

    if (typeof bootstrap !== "undefined" && typeof bootstrap.Tab === "function") {
        bootstrap.Tab.getOrCreateInstance(reserveTabBtn).show();
        if (reserveTab) {
            reserveTab.setAttribute("tabindex", "-1");
            reserveTab.scrollIntoView({ behavior: "smooth", block: "start" });
            try {
                reserveTab.focus({ preventScroll: true });
            } catch (err) {
                reserveTab.focus();
            }
        } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
    }
    reserveTabBtn.click();
    if (reserveTab) {
        reserveTab.setAttribute("tabindex", "-1");
        reserveTab.scrollIntoView({ behavior: "smooth", block: "start" });
        try {
            reserveTab.focus({ preventScroll: true });
        } catch (err) {
            reserveTab.focus();
        }
    } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function setRoomSelectionByID(roomID) {
    const roomSelect = document.getElementById("roomSelect");
    if (!roomSelect || Number.isNaN(roomID)) return;

    const target = String(roomID);
    const hasOption = Array.from(roomSelect.options).some(option => option.value === target);
    if (hasOption) {
        roomSelect.value = target;
    }
}

function prefillReservationFromTimelineEvent(data) {
    if (Number.isInteger(Number(data.reservationId))) {
        beginReservationEdit(Number(data.reservationId));
        return;
    }

    const startDate = new Date(data.start);
    const endDate = new Date(data.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return;
    }

    schedulerState.startDateTime = startDate;
    schedulerState.endDateTime = endDate;
    schedulerState.selectedDate = new Date(startDate);
    schedulerState.selectedDate.setHours(0, 0, 0, 0);

    setRoomSelectionByID(Number(data.roomId));
    updateReservationSummary();
    syncManualInputsFromState();
    openReserveTab();
}

function prefillReservationForDay(dayKey) {
    if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        return;
    }

    const [year, month, day] = dayKey.split("-").map(Number);
    const selectedDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (Number.isNaN(selectedDate.getTime())) {
        return;
    }

    let start = schedulerState.startDateTime ? new Date(schedulerState.startDateTime) : new Date(selectedDate);
    let end = schedulerState.endDateTime ? new Date(schedulerState.endDateTime) : new Date(selectedDate);

    // Reuse the previously chosen hours when jumping days so repeated booking edits stay fast.
    if (!schedulerState.startDateTime || !schedulerState.endDateTime) {
        start.setHours(9, 0, 0, 0);
        end.setHours(10, 0, 0, 0);
    } else {
        start.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        end.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        if (end <= start) {
            end = new Date(start);
            end.setHours(start.getHours() + 1, start.getMinutes(), 0, 0);
        }
    }

    schedulerState.selectedDate = selectedDate;
    schedulerState.startDateTime = start;
    schedulerState.endDateTime = end;
    updateReservationSummary();
    syncManualInputsFromState();
    openReserveTab();
}

function renderCalendarDayCell(container, dayDate, eventsByDay, todayKey, showWeekLabel = false) {
    const cellKey = toLocalDayKey(dayDate);
    const dayEvents = (eventsByDay.get(cellKey) || []).filter(event => matchesStatusFilter(event) && isInRoomFilter(event));

    const cell = document.createElement("div");
    cell.className = `calendar-day${cellKey === todayKey ? " is-today" : ""}`;
    cell.dataset.day = cellKey;

    const top = document.createElement("div");
    top.className = "calendar-day-top";

    const header = document.createElement("div");
    header.className = "calendar-day-header";
    header.textContent = String(dayDate.getDate());
    top.appendChild(header);

    if (showWeekLabel) {
        const weekLabel = document.createElement("div");
        weekLabel.className = "calendar-day-weeklabel";
        weekLabel.textContent = dayDate.toLocaleDateString([], { weekday: "short" });
        top.appendChild(weekLabel);
    }

    const count = document.createElement("div");
    count.className = "calendar-day-count";
    count.textContent = `${dayEvents.length} reservation${dayEvents.length === 1 ? "" : "s"}`;
    top.appendChild(count);
    cell.appendChild(top);

    const eventsHost = document.createElement("div");
    eventsHost.className = "timeline-events";

    if (dayEvents.length === 0) {
        const empty = document.createElement("div");
        empty.className = "timeline-empty";
        empty.textContent = "Free day";
        eventsHost.appendChild(empty);
    } else {
        dayEvents.forEach(event => {
            const eventEl = document.createElement("div");
            const nowClass = isReservationOngoing(event) ? " is-now" : "";
            eventEl.className = `timeline-event ${timelineStatusClass(event)}${nowClass}`;
            eventEl.dataset.reservationId = String(event.id || "");
            eventEl.dataset.start = event.startDate.toISOString();
            eventEl.dataset.end = event.endDate.toISOString();
            eventEl.dataset.roomId = String(event.roomID || "");
            eventEl.innerHTML = `
                <div class="timeline-event-header">
                    <span class="timeline-event-time">${eventTimeLabel(event.startDate, event.endDate)}</span>
                    <div class="d-flex align-items-center gap-1">
                        <span class="status-pill ${statusClassFromReservation(event)}">${escapeHTML(statusLabelFromReservation(event))}</span>
                    </div>
                </div>
                <div class="timeline-event-room">${escapeHTML(event.room)}${event.attendeeCount > 0 ? ` (${escapeHTML(String(event.attendeeCount))})` : ""}</div>
            `;
            eventsHost.appendChild(eventEl);
        });

        const reservable = document.createElement("div");
        reservable.className = "timeline-reservable";
        reservable.textContent = "Reservable";
        eventsHost.appendChild(reservable);
    }

    if (dayEvents.length > 0) {
        const tooltip = dayEvents
            .map(event => `${eventTimeLabel(event.startDate, event.endDate)} ${event.room} (${event.status})`)
            .join("\n");
        cell.title = tooltip;
    }

    cell.appendChild(eventsHost);
    container.appendChild(cell);
}

function renderCalendarWeekdays() {
    const weekdaysHost = document.getElementById("calendarWeekdays");
    if (!weekdaysHost) return;

    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekdaysHost.innerHTML = labels.map(label => `<div class="calendar-weekday">${label}</div>`).join("");
}

function renderTimelineSummary() {
    const summaryHost = document.getElementById("timelineSummary");
    if (!summaryHost) return;

    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const relevant = getNormalizedReservations().filter(isInRoomFilter);
    const upcoming = relevant
        .filter(r => getReservationState(r) === "active_now" || getReservationState(r) === "upcoming")
        .sort((a, b) => a.startDate - b.startDate);
    const nextBooking = upcoming.find(r => r.endDate >= now) || null;

    // Weekly usage is clipped to the current week so long reservations do not overcount hours outside the range.
    const weeklyHours = relevant
        .filter(r => r.endDate > weekStart && r.startDate < weekEnd && getReservationState(r) !== "cancelled")
        .reduce((sum, r) => {
            const start = new Date(Math.max(r.startDate.getTime(), weekStart.getTime()));
            const end = new Date(Math.min(r.endDate.getTime(), weekEnd.getTime()));
            return sum + Math.max(0, (end - start) / 3600000);
        }, 0);

    summaryHost.innerHTML = `
        <span class="timeline-summary-chip">${nextBooking ? `Next booking: ${nextBooking.startDate.toLocaleDateString()} ${eventTimeLabel(nextBooking.startDate, nextBooking.endDate)} (${escapeHTML(nextBooking.room)})` : "Next booking: none"}</span>
        <span class="timeline-summary-chip">Booked this week: ${weeklyHours.toFixed(1)}h</span>
    `;
}

function renderReservationCalendar() {
    const grid = document.getElementById("bookingsCalendarGrid");
    const monthLabel = document.getElementById("calendarMonthLabel");
    if (!grid || !monthLabel) return;

    const todayKey = toLocalDayKey(new Date());
    const eventsByDay = getDayEventsMap();
    renderTimelineSummary();
    grid.innerHTML = "";
    if (calendarViewMode === "week") {
        grid.classList.add("is-week-view");
        const weekStart = startOfWeek(calendarViewDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        monthLabel.textContent = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

        for (let offset = 0; offset < 7; offset += 1) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + offset);
            renderCalendarDayCell(grid, dayDate, eventsByDay, todayKey, true);
        }
        return;
    }
    grid.classList.remove("is-week-view");

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingEmptyDays = firstDay.getDay();
    monthLabel.textContent = firstDay.toLocaleDateString([], { month: "long", year: "numeric" });

    for (let i = 0; i < leadingEmptyDays; i += 1) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-day is-empty";
        grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const dayDate = new Date(year, month, day);
        renderCalendarDayCell(grid, dayDate, eventsByDay, todayKey, false);
    }
}

function shiftCalendarMonth(offset) {
    if (calendarViewMode === "week") {
        calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), calendarViewDate.getDate() + 7 * offset);
    } else {
        calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + offset, 1);
    }
    renderReservationCalendar();
}

function goToToday() {
    const now = new Date();
    calendarViewDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    renderReservationCalendar();
}

function applyCalendarViewMode(mode) {
    calendarViewMode = mode === "week" ? "week" : "month";
    goToToday();
}

function setupCalendarKeyboardShortcuts() {
    document.addEventListener("keydown", event => {
        const calendarTabPane = document.getElementById("calendar-tab");
        if (!calendarTabPane || !calendarTabPane.classList.contains("active")) {
            return;
        }

        const active = document.activeElement;
        const tag = active?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || active?.isContentEditable) {
            return;
        }

        if (event.key === "ArrowLeft") {
            shiftCalendarMonth(-1);
        } else if (event.key === "ArrowRight") {
            shiftCalendarMonth(1);
        } else if (event.key.toLowerCase() === "w") {
            const select = document.getElementById("calendarViewModeSelect");
            if (select) select.value = "week";
            applyCalendarViewMode("week");
        } else if (event.key.toLowerCase() === "m") {
            const select = document.getElementById("calendarViewModeSelect");
            if (select) select.value = "month";
            applyCalendarViewMode("month");
        }
    });
}

function fillCalendarRoomFilterOptions() {
    const roomFilter = document.getElementById("calendarRoomFilterSelect");
    if (!roomFilter) return;

    const currentValue = roomFilter.value || "all";
    const roomOptions = Array.from(roomNameByID.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    roomFilter.innerHTML = `<option value="all">All rooms</option>`;
    roomOptions.forEach(([id, name]) => {
        const option = document.createElement("option");
        option.value = String(id);
        option.textContent = name;
        roomFilter.appendChild(option);
    });
    roomFilter.value = roomOptions.some(([id]) => String(id) === String(currentValue)) ? currentValue : "all";
}

function initBookingsCalendar() {
    renderCalendarWeekdays();
    renderReservationCalendar();
    renderBookingListing();

    const prevBtn = document.getElementById("calendarPrevBtn");
    const todayBtn = document.getElementById("calendarTodayBtn");
    const nextBtn = document.getElementById("calendarNextBtn");
    const viewModeSelect = document.getElementById("calendarViewModeSelect");
    const statusFilterSelect = document.getElementById("calendarStatusFilterSelect");
    const roomFilterSelect = document.getElementById("calendarRoomFilterSelect");
    const listingDateFilter = document.getElementById("listingDateFilter");
    const listingStatusFilter = document.getElementById("listingStatusFilter");
    const listingSearchInput = document.getElementById("listingSearchInput");
    const listingSortSelect = document.getElementById("listingSortSelect");
    const listingRefreshBtn = document.getElementById("listingRefreshBtn");
    const timelineGrid = document.getElementById("bookingsCalendarGrid");
    const listingRows = document.getElementById("bookingListingRows");

    if (!prevBtn || !nextBtn || !viewModeSelect || !statusFilterSelect) return;

    prevBtn.addEventListener("click", () => shiftCalendarMonth(-1));
    if (todayBtn) {
        todayBtn.addEventListener("click", goToToday);
    }
    nextBtn.addEventListener("click", () => shiftCalendarMonth(1));

    viewModeSelect.value = calendarViewMode;
    viewModeSelect.addEventListener("change", () => {
        applyCalendarViewMode(viewModeSelect.value);
    });

    statusFilterSelect.value = calendarStatusFilter;
    statusFilterSelect.addEventListener("change", () => {
        calendarStatusFilter = statusFilterSelect.value || "all";
        renderReservationCalendar();
    });

    if (roomFilterSelect) {
        roomFilterSelect.value = calendarRoomFilter;
        roomFilterSelect.addEventListener("change", () => {
            calendarRoomFilter = roomFilterSelect.value || "all";
            renderReservationCalendar();
            renderBookingListing();
        });
    }

    if (listingDateFilter) {
        listingDateFilter.value = listingState.date;
        listingDateFilter.addEventListener("change", () => {
            listingState.date = listingDateFilter.value || "all";
            renderBookingListing();
        });
    }

    if (listingStatusFilter) {
        listingStatusFilter.value = listingState.status;
        listingStatusFilter.addEventListener("change", () => {
            listingState.status = listingStatusFilter.value || "any";
            renderBookingListing();
        });
    }

    if (listingSearchInput) {
        listingSearchInput.value = listingState.search;
        listingSearchInput.addEventListener("input", () => {
            listingState.search = listingSearchInput.value || "";
            renderBookingListing();
        });
    }

    if (listingSortSelect) {
        listingSortSelect.value = listingState.sort;
        listingSortSelect.addEventListener("change", () => {
            listingState.sort = listingSortSelect.value || "start_desc";
            renderBookingListing();
        });
    }

    if (listingRefreshBtn) {
        listingRefreshBtn.addEventListener("click", () => {
            fetchReservations();
        });
    }

    if (listingRows) {
        listingRows.addEventListener("click", event => {
            const editButton = event.target.closest(".js-edit-booking");
            if (editButton) {
                const resID = Number(editButton.dataset.reservationId);
                if (Number.isNaN(resID)) {
                    alert("Invalid reservation ID.");
                    return;
                }
                beginReservationEdit(resID);
                return;
            }

            const deleteButton = event.target.closest(".js-delete-booking");
            if (!deleteButton) return;

            const resID = Number(deleteButton.dataset.reservationId);
            if (Number.isNaN(resID)) {
                alert("Invalid reservation ID.");
                return;
            }

            deleteReservation(resID);
        });
    }

    if (timelineGrid) {
        timelineGrid.addEventListener("click", event => {
            const target = event.target.closest(".timeline-event");
            if (target) {
                prefillReservationFromTimelineEvent({
                    reservationId: target.dataset.reservationId,
                    start: target.dataset.start,
                    end: target.dataset.end,
                    roomId: target.dataset.roomId
                });
                return;
            }

            const emptyDayTarget = event.target.closest(".timeline-empty");
            if (emptyDayTarget) {
                const dayCell = emptyDayTarget.closest(".calendar-day");
                if (!dayCell) return;
                prefillReservationForDay(dayCell.dataset.day || "");
                return;
            }

            const reservableTarget = event.target.closest(".timeline-reservable");
            if (!reservableTarget) return;

            const dayCell = reservableTarget.closest(".calendar-day");
            if (!dayCell) return;
            prefillReservationForDay(dayCell.dataset.day || "");
        });
        timelineGrid.addEventListener("click", event => {
            const target = event.target.closest(".timeline-event");
            if (target) {
                return;
            }
            if (event.target.closest(".timeline-empty") || event.target.closest(".timeline-reservable")) {
                return;
            }

            const dayCell = event.target.closest(".calendar-day");
            if (!dayCell || dayCell.classList.contains("is-empty")) {
                return;
            }

            prefillReservationForDay(dayCell.dataset.day || "");
        });
    }

    setupCalendarKeyboardShortcuts();
}
