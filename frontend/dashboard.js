// -------------------- Helpers --------------------
function getToken() {
    return localStorage.getItem("token");
}

function getStoredDisplayName() {
    const directName = (localStorage.getItem("user_name") || "").trim();
    if (directName) return directName;

    const email = (localStorage.getItem("user_email") || "").trim();
    if (!email || !email.includes("@")) return "there";

    const localPart = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (!localPart) return "there";
    return localPart
        .split(" ")
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function renderWelcomeUserName() {
    const host = document.getElementById("welcomeUserName");
    if (!host) return;
    host.textContent = getStoredDisplayName();
}

function decodeJWTPayload(token) {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
        return JSON.parse(decoded);
    } catch (err) {
        return null;
    }
}

function getStoredUserRole() {
    const directRole = (localStorage.getItem("user_role") || "").trim().toLowerCase();
    if (directRole) {
        return directRole;
    }

    const token = getToken();
    const payload = token ? decodeJWTPayload(token) : null;
    const tokenRole = String(payload?.role || "").trim().toLowerCase();
    if (tokenRole) {
        localStorage.setItem("user_role", tokenRole);
        return tokenRole;
    }

    return "student";
}

function renderWelcomeUserRole() {
    const host = document.getElementById("welcomeUserRole");
    if (!host) return;
    host.textContent = getStoredUserRole() || "student";
}

function isMobilePreviewEnabled() {
    return localStorage.getItem("mobile_view_preview") === "true";
}

function renderMobileViewToggle() {
    const btn = document.getElementById("mobileViewToggleBtn");
    if (!btn) return;
    const enabled = isMobilePreviewEnabled();
    document.body.classList.toggle("mobile-preview", enabled);
    btn.textContent = `Mobile View: ${enabled ? "On" : "Off"}`;
    btn.className = enabled ? "btn btn-primary btn-sm" : "btn btn-outline-primary btn-sm";
    window.setTimeout(refreshSyncedHorizontalScrollbars, 0);
}

function toggleMobileViewPreview() {
    const nextValue = !isMobilePreviewEnabled();
    localStorage.setItem("mobile_view_preview", String(nextValue));
    renderMobileViewToggle();
}

function openCalendarTab() {
    const calendarTabBtn = document.getElementById("calendar-tab-btn");
    if (!calendarTabBtn) return;

    if (typeof bootstrap !== "undefined" && typeof bootstrap.Tab === "function") {
        bootstrap.Tab.getOrCreateInstance(calendarTabBtn).show();
        return;
    }

    calendarTabBtn.click();
}

function fillProfileForm(profile) {
    profileSnapshot = {
        name: String(profile?.name || ""),
        email: String(profile?.email || ""),
        role: String(profile?.role || "")
    };

    const nameInput = document.getElementById("profileName");
    const emailInput = document.getElementById("profileEmail");
    const roleInput = document.getElementById("profileRole");
    const currentPasswordInput = document.getElementById("profileCurrentPassword");
    const newPasswordInput = document.getElementById("profileNewPassword");
    if (nameInput) nameInput.value = profileSnapshot.name;
    if (emailInput) emailInput.value = profileSnapshot.email;
    if (roleInput) roleInput.value = profileSnapshot.role;
    if (currentPasswordInput) currentPasswordInput.value = "";
    if (newPasswordInput) newPasswordInput.value = "";
}

async function fetchProfile() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/profile", {
        headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to load profile.", "danger", "profileActionToast", "profileActionToastBody");
        return;
    }

    const profile = await writeJSON(res);
    fillProfileForm(profile || {});
}

async function saveProfile(event) {
    event.preventDefault();
    const token = getToken();
    if (!token) return;

    const name = document.getElementById("profileName")?.value.trim() || "";
    const email = document.getElementById("profileEmail")?.value.trim() || "";
    const currentPassword = document.getElementById("profileCurrentPassword")?.value.trim() || "";
    const newPassword = document.getElementById("profileNewPassword")?.value.trim() || "";
    if (!name || !email) {
        showToast("Name and email are required.", "danger", "profileActionToast", "profileActionToastBody");
        return;
    }

    const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name,
            email,
            current_password: currentPassword,
            new_password: newPassword
        })
    });
    if (!res.ok) {
        const err = await res.text();
        showToast(err || "Failed to update profile.", "danger", "profileActionToast", "profileActionToastBody");
        return;
    }

    const profile = await writeJSON(res);
    fillProfileForm(profile || { name, email, role: profileSnapshot.role });
    localStorage.setItem("user_name", String(profile?.name || name));
    localStorage.setItem("user_email", String(profile?.email || email));
    renderWelcomeUserName();
    showToast("Profile updated.", "success", "profileActionToast", "profileActionToastBody");
}

function resetProfileForm() {
    fillProfileForm(profileSnapshot);
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_role");
    localStorage.removeItem("mobile_view_preview");
    location.href = "index.html";
}

async function writeJSON(res) {
    try {
        return await res.json();
    } catch (err) {
        console.error("Failed to parse JSON:", err);
        return null;
    }
}

function normalizeToastVariant(variant) {
    if (variant === "success" || variant === "danger") return variant;
    if (variant === "error" || variant === "failure") return "danger";
    return "dark";
}

function showToast(message, variant = "dark", toastID = "actionToast", bodyID = "actionToastBody") {
    const toastEl = document.getElementById(toastID);
    const bodyEl = document.getElementById(bodyID);
    if (!toastEl || !bodyEl) return;

    const resolvedVariant = normalizeToastVariant(variant);
    const isInlineToast = toastID === "reservationActionToast";
    toastEl.className = isInlineToast
        ? `toast align-items-center border-0 w-100 text-${resolvedVariant === "danger" ? "white" : "dark"}`
        : `toast align-items-center text-bg-${resolvedVariant} border-0`;
    if (isInlineToast) {
        toastEl.style.backgroundColor = resolvedVariant === "success" ? "#d1e7dd" : "#dc3545";
    } else {
        toastEl.style.backgroundColor = "";
    }
    bodyEl.textContent = message;

    if (typeof bootstrap !== "undefined" && typeof bootstrap.Toast === "function") {
        bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2600 }).show();
        return;
    }

    toastEl.classList.add("show");
    window.setTimeout(() => {
        toastEl.classList.remove("show");
    }, 2600);
}

// -------------------- Reservation Scheduler State --------------------
const schedulerState = {
    selectedDate: null,
    startDateTime: null,
    endDateTime: null,
    calendar: null,
    modal: null
};

const availabilityFeedbackState = {
    variant: "secondary",
    message: "Choose date, time, and group size to load matching rooms."
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
    refreshAvailableRooms().catch(err => {
        setRoomAvailabilityHint(String(err.message || err), true);
    });
    return true;
}

function initSchedulerModal() {
    const schedulerModalEl = document.getElementById("schedulerModal");
    const openSchedulerBtn = document.getElementById("openSchedulerBtn");
    const nextBtn = document.getElementById("schedulerNextBtn");
    const backBtn = document.getElementById("schedulerBackBtn");
    const manualDateInput = document.getElementById("manualDate");
    const manualStartInput = document.getElementById("manualStartTime");
    const manualEndInput = document.getElementById("manualEndTime");

    if (
        !schedulerModalEl ||
        !openSchedulerBtn ||
        !nextBtn ||
        !backBtn ||
        !manualDateInput ||
        !manualStartInput ||
        !manualEndInput
    ) {
        return;
    }

    initTimeSelectOptions();

    manualDateInput.addEventListener("change", () => {
        if (applyManualDateTimeInputs()) {
            refreshAvailableRooms().catch(err => {
                setRoomAvailabilityHint(String(err.message || err), true);
            });
        }
    });

    manualStartInput.addEventListener("change", () => {
        if (applyManualDateTimeInputs()) {
            refreshAvailableRooms().catch(err => {
                setRoomAvailabilityHint(String(err.message || err), true);
            });
        }
    });

    manualEndInput.addEventListener("change", () => {
        if (applyManualDateTimeInputs()) {
            refreshAvailableRooms().catch(err => {
                setRoomAvailabilityHint(String(err.message || err), true);
            });
        }
    });

    const bootstrapAvailable = typeof bootstrap !== "undefined" && typeof bootstrap.Modal === "function";
    const flatpickrAvailable = typeof flatpickr === "function";
    if (!bootstrapAvailable || !flatpickrAvailable) {
        openSchedulerBtn.disabled = true;
        openSchedulerBtn.title = "Scheduler unavailable. Use manual date and time inputs.";
        updateReservationSummary();
        return;
    }

    schedulerState.modal = new bootstrap.Modal(schedulerModalEl);
    schedulerState.calendar = flatpickr("#calendarContainer", {
        inline: true,
        minDate: "today",
        dateFormat: "Y-m-d",
        onChange(selectedDates) {
            schedulerState.selectedDate = selectedDates[0] || null;
            nextBtn.disabled = !schedulerState.selectedDate;
        }
    });

    openSchedulerBtn.addEventListener("click", () => {
        showCalendarStep();
        schedulerState.modal.show();
    });

    backBtn.addEventListener("click", showCalendarStep);

    nextBtn.addEventListener("click", () => {
        const title = document.getElementById("schedulerTitle").textContent;
        if (title === "Choose reservation date") {
            showTimeStep();
        } else {
            applyTimeSelection();
        }
    });

    updateReservationSummary();
}

const roomNameByID = new Map();
const roomDetailsByID = new Map();
let reservationsCache = [];
let adminReservationsCache = [];
let editingReservationID = null;
let editingRoomID = null;
let calendarViewDate = new Date();
let calendarViewMode = "month";
let calendarStatusFilter = "all";
let calendarRoomFilter = "all";
const listingState = {
    date: "all",
    status: "any",
    search: "",
    sort: "start_desc"
};
const adminReservationFilters = {
    userQuery: "",
    roomID: "all",
    date: ""
};
let adminViewMode = "rooms";
let adminRoomSearchQuery = "";
const calculatorState = {
    expression: "",
    displayValue: "0",
    justEvaluated: false,
    previousExpression: ""
};
let profileSnapshot = {
    name: "",
    email: "",
    role: ""
};

function toLocalDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function normalizeStatus(status) {
    return String(status || "other").toLowerCase();
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
}

function renderCalculator() {
    const display = document.getElementById("calculatorDisplay");
    const subdisplay = document.getElementById("calculatorSubdisplay");
    if (!display || !subdisplay) return;
    display.value = calculatorState.displayValue || "0";
    subdisplay.textContent = calculatorState.previousExpression || calculatorState.expression || "";
}

function normalizeCalculatorExpression(expr) {
    return String(expr || "").replace(/\s+/g, "");
}

function getLastCalculatorOperand(expr) {
    const match = normalizeCalculatorExpression(expr).match(/-?\d*\.?\d+$/);
    return match ? match[0] : "";
}

function setCalculatorError() {
    calculatorState.expression = "";
    calculatorState.displayValue = "Error";
    calculatorState.justEvaluated = true;
}

function appendCalculatorDigit(digit) {
    if (calculatorState.justEvaluated) {
        calculatorState.expression = "";
        calculatorState.previousExpression = "";
        calculatorState.justEvaluated = false;
    }
    const nextExpression = `${calculatorState.expression}${digit}`;
    calculatorState.expression = nextExpression;
    calculatorState.displayValue = getLastCalculatorOperand(nextExpression) || digit;
}

function appendCalculatorDecimal() {
    if (calculatorState.justEvaluated) {
        calculatorState.expression = "";
        calculatorState.previousExpression = "";
        calculatorState.justEvaluated = false;
    }

    const normalized = normalizeCalculatorExpression(calculatorState.expression);
    const lastOperand = getLastCalculatorOperand(normalized);
    if (lastOperand.includes(".")) return;

    if (!normalized || /[+\-*/]$/.test(normalized)) {
        calculatorState.expression = `${normalized}0.`;
        calculatorState.displayValue = "0.";
        return;
    }

    calculatorState.expression = `${normalized}.`;
    calculatorState.displayValue = `${lastOperand}.`;
}

function appendCalculatorOperator(operator) {
    const normalized = normalizeCalculatorExpression(calculatorState.expression);
    if (!normalized) {
        if (operator === "-") {
            calculatorState.expression = "-";
            calculatorState.displayValue = "-";
        }
        return;
    }

    if (calculatorState.justEvaluated) {
        calculatorState.justEvaluated = false;
    }

    if (/[+\-*/]$/.test(normalized)) {
        calculatorState.expression = `${normalized.slice(0, -1)}${operator}`;
        return;
    }

    calculatorState.expression = `${normalized}${operator}`;
}

function toggleCalculatorSign() {
    const normalized = normalizeCalculatorExpression(calculatorState.expression);
    if (!normalized) {
        calculatorState.expression = "-";
        calculatorState.displayValue = "-";
        return;
    }

    const match = normalized.match(/-?\d*\.?\d+$/);
    if (!match) return;

    const operand = match[0];
    const operandIndex = normalized.lastIndexOf(operand);
    const toggled = operand.startsWith("-") ? operand.slice(1) : `-${operand}`;
    calculatorState.expression = `${normalized.slice(0, operandIndex)}${toggled}`;
    calculatorState.displayValue = toggled;
}

function backspaceCalculator() {
    if (calculatorState.justEvaluated) {
        calculatorState.expression = "";
        calculatorState.displayValue = "0";
        calculatorState.previousExpression = "";
        calculatorState.justEvaluated = false;
        return;
    }

    const nextExpression = normalizeCalculatorExpression(calculatorState.expression).slice(0, -1);
    calculatorState.expression = nextExpression;
    if (!nextExpression) {
        calculatorState.displayValue = "0";
        return;
    }

    const lastOperand = getLastCalculatorOperand(nextExpression);
    calculatorState.displayValue = lastOperand || nextExpression.slice(-1);
}

function clearCalculator() {
    calculatorState.expression = "";
    calculatorState.displayValue = "0";
    calculatorState.justEvaluated = false;
    calculatorState.previousExpression = "";
}

function evaluateCalculator() {
    const expression = normalizeCalculatorExpression(calculatorState.expression);
    if (!expression || /[+\-*/.]$/.test(expression)) {
        return;
    }
    if (!/^[0-9+\-*/.]+$/.test(expression)) {
        setCalculatorError();
        return;
    }

    try {
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== "number" || !Number.isFinite(result)) {
            setCalculatorError();
            return;
        }
        const formatted = Number.isInteger(result) ? String(result) : String(Number(result.toFixed(8)));
        calculatorState.previousExpression = `${expression} =`;
        calculatorState.expression = formatted;
        calculatorState.displayValue = formatted;
        calculatorState.justEvaluated = true;
    } catch (err) {
        setCalculatorError();
    }
}

function handleCalculatorAction(action, value = "") {
    switch (action) {
    case "digit":
        appendCalculatorDigit(value);
        break;
    case "decimal":
        appendCalculatorDecimal();
        break;
    case "operator":
        appendCalculatorOperator(value);
        break;
    case "toggle-sign":
        toggleCalculatorSign();
        break;
    case "backspace":
        backspaceCalculator();
        break;
    case "clear":
        clearCalculator();
        break;
    case "equals":
        evaluateCalculator();
        break;
    default:
        return;
    }
    renderCalculator();
}

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
        rowsHost.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No bookings found for current filters.</td></tr>`;
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
                        <li><button class="dropdown-item" type="button">Set as Pending</button></li>
                        <li><button class="dropdown-item js-edit-booking" type="button" data-reservation-id="${model.id}">Edit booking</button></li>
                        <li><button class="dropdown-item" type="button">Edit note</button></li>
                        <li><button class="dropdown-item" type="button">Print</button></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><button class="dropdown-item text-danger js-delete-booking" type="button" data-reservation-id="${model.id}">Delete booking</button></li>
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
    if (!reserveTabBtn) return;

    if (typeof bootstrap !== "undefined" && typeof bootstrap.Tab === "function") {
        bootstrap.Tab.getOrCreateInstance(reserveTabBtn).show();
        return;
    }
    reserveTabBtn.click();
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
            if (!emptyDayTarget) return;

            const dayCell = emptyDayTarget.closest(".calendar-day");
            if (!dayCell) return;
            prefillReservationForDay(dayCell.dataset.day || "");
        });
    }

    setupCalendarKeyboardShortcuts();
}

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
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map(room => ({
                ...room,
                available_capacity: room.capacity,
                fits_required_capacity: Number(room.capacity) >= params.attendeeCount
            }));
        populateRoomSelect(rooms, params.attendeeCount);
        setRoomAvailabilityHint("Choose date and time to see live remaining seats for each room.");
        setAvailabilityFeedback("secondary", "Group size is set. Choose a date and time to calculate live availability.");
        return;
    }

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

// -------------------- Init Dashboard --------------------
async function initDashboard() {
    const token = getToken();
    if (!token) {
        location.href = "index.html";
        return;
    }

    renderMobileViewToggle();
    renderWelcomeUserName();
    renderWelcomeUserRole();
    renderCalculator();
    bindSyncedHorizontalScroll("bookingListTopScrollbar", "bookingListScrollHost");
    bindSyncedHorizontalScroll("adminRoomsTopScrollbar", "adminRoomsScrollHost");
    bindSyncedHorizontalScroll("adminReservationsTopScrollbar", "adminReservationsScrollHost");
    window.addEventListener("resize", refreshSyncedHorizontalScrollbars);
    initBookingsCalendar();
    initSchedulerModal();
    await fetchAllRooms();
    await refreshAvailableRooms();
    await fetchReservations();
    await fetchAdminReservations();
    await fetchProfile();

    document.getElementById("reservationForm").addEventListener("submit", createReservation);
    document.getElementById("attendeeCount").addEventListener("input", () => {
        refreshAvailableRooms().catch(err => {
            setRoomAvailabilityHint(String(err.message || err), true);
        });
    });
    document.getElementById("reservationDeleteEditBtn").addEventListener("click", () => {
        if (editingReservationID === null) return;
        deleteReservation(editingReservationID, {
            confirmationMessage: "Delete this reservation from the edit panel?",
            resetEditMode: true,
            toastID: "reservationActionToast",
            toastBodyID: "reservationActionToastBody"
        });
    });
    document.getElementById("reservationCancelEditBtn").addEventListener("click", () => {
        resetReservationFormMode();
        refreshAvailableRooms().catch(err => {
            setRoomAvailabilityHint(String(err.message || err), true);
        });
    });
    updateReservationFormMode();

    const adminRoomForm = document.getElementById("adminRoomForm");
    const adminRoomRows = document.getElementById("adminRoomRows");
    const adminRoomSearchInput = document.getElementById("adminRoomSearchInput");
    const adminReservationRows = document.getElementById("adminReservationRows");
    const calculatorTab = document.getElementById("calculator-tab");
    const profileForm = document.getElementById("profileForm");
    const profileResetBtn = document.getElementById("profileResetBtn");
    const adminRoomsViewBtn = document.getElementById("adminRoomsViewBtn");
    const adminReservationsViewBtn = document.getElementById("adminReservationsViewBtn");
    if (adminRoomForm) {
        adminRoomForm.addEventListener("submit", saveAdminRoom);
    }
    if (adminRoomSearchInput) {
        adminRoomSearchInput.addEventListener("input", () => {
            adminRoomSearchQuery = adminRoomSearchInput.value || "";
            renderAdminRoomPanel();
        });
    }
    if (calculatorTab) {
        calculatorTab.addEventListener("click", event => {
            const button = event.target.closest("[data-calc-action]");
            if (!button) return;
            handleCalculatorAction(button.dataset.calcAction, button.dataset.calcValue || "");
        });
    }
    if (profileForm) {
        profileForm.addEventListener("submit", saveProfile);
    }
    if (profileResetBtn) {
        profileResetBtn.addEventListener("click", resetProfileForm);
    }
    if (adminRoomRows) {
        adminRoomRows.addEventListener("click", event => {
            const editButton = event.target.closest(".js-admin-room-edit");
            if (editButton) {
                beginAdminRoomEdit(Number(editButton.dataset.roomId));
                return;
            }

            const saveButton = event.target.closest(".js-admin-room-save");
            if (saveButton) {
                saveInlineAdminRoom(Number(saveButton.dataset.roomId));
                return;
            }

            const cancelButton = event.target.closest(".js-admin-room-cancel");
            if (cancelButton) {
                editingRoomID = null;
                renderAdminRoomPanel();
                return;
            }

            const deleteButton = event.target.closest(".js-admin-room-delete");
            if (deleteButton) {
                deleteAdminRoom(Number(deleteButton.dataset.roomId));
                return;
            }

            const deactivateButton = event.target.closest(".js-admin-room-deactivate");
            if (deactivateButton) {
                deactivateAdminRoom(Number(deactivateButton.dataset.roomId));
            }
        });
    }
    const adminReservationUserFilter = document.getElementById("adminReservationUserFilter");
    const adminReservationRoomFilter = document.getElementById("adminReservationRoomFilter");
    const adminReservationDateFilter = document.getElementById("adminReservationDateFilter");
    const adminReservationRefreshBtn = document.getElementById("adminReservationRefreshBtn");
    const adminReservationClearFiltersBtn = document.getElementById("adminReservationClearFiltersBtn");
    const adminReservationExportBtn = document.getElementById("adminReservationExportBtn");
    if (adminReservationUserFilter) {
        adminReservationUserFilter.addEventListener("input", () => {
            adminReservationFilters.userQuery = adminReservationUserFilter.value || "";
            renderAdminReservations();
        });
    }
    if (adminReservationRoomFilter) {
        adminReservationRoomFilter.addEventListener("change", () => {
            adminReservationFilters.roomID = adminReservationRoomFilter.value || "all";
            renderAdminReservations();
        });
    }
    if (adminReservationDateFilter) {
        adminReservationDateFilter.addEventListener("change", () => {
            adminReservationFilters.date = adminReservationDateFilter.value || "";
            renderAdminReservations();
        });
    }
    if (adminReservationRefreshBtn) {
        adminReservationRefreshBtn.addEventListener("click", () => {
            fetchAdminReservations();
        });
    }
    if (adminReservationClearFiltersBtn) {
        adminReservationClearFiltersBtn.addEventListener("click", clearAdminReservationFilters);
    }
    if (adminReservationExportBtn) {
        adminReservationExportBtn.addEventListener("click", exportAdminReservationsCSV);
    }
    if (adminReservationRows) {
        adminReservationRows.addEventListener("click", event => {
            const userDrilldownButton = event.target.closest(".js-admin-user-drilldown");
            if (userDrilldownButton) {
                adminReservationFilters.userQuery = userDrilldownButton.dataset.userQuery || "";
                syncAdminReservationFilterInputs();
                renderAdminReservations();
                return;
            }
            const deleteButton = event.target.closest(".js-admin-delete-reservation");
            if (deleteButton) {
                deleteAdminReservation(Number(deleteButton.dataset.reservationId));
            }
        });
    }
    if (adminRoomsViewBtn) {
        adminRoomsViewBtn.addEventListener("click", () => {
            adminViewMode = "rooms";
            renderAdminRoomPanel();
        });
    }
    if (adminReservationsViewBtn) {
        adminReservationsViewBtn.addEventListener("click", () => {
            adminViewMode = "reservations";
            renderAdminRoomPanel();
            renderAdminReservations();
        });
    }
    const logoutBtn = document.getElementById("logoutBtn");
    const mobileViewToggleBtn = document.getElementById("mobileViewToggleBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }
    if (mobileViewToggleBtn) {
        mobileViewToggleBtn.addEventListener("click", toggleMobileViewPreview);
    }
    updateAdminRoomFormMode();
    renderAdminRoomPanel();
}

window.addEventListener("DOMContentLoaded", initDashboard);
