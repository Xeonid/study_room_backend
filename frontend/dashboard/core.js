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

    // The dashboard still has to gate admin-only UI after a full page refresh.
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
        for (let minute = 0; minute < 60; minute += 1) {
            const label = String(minute).padStart(2, "0");
            select.appendChild(createOption(minute, label));
        }
    });
}

function showCalendarStep() {
    const calendarStep = document.getElementById("calendarStep");
    const timeStep = document.getElementById("timeStep");
    const title = document.getElementById("schedulerTitle");
    const backBtn = document.getElementById("schedulerBackBtn");
    const nextBtn = document.getElementById("schedulerNextBtn");
    if (calendarStep) calendarStep.classList.remove("d-none");
    if (timeStep) timeStep.classList.add("d-none");
    if (title) title.textContent = "Choose reservation date";
    if (backBtn) backBtn.classList.add("d-none");
    if (nextBtn) {
        nextBtn.textContent = "Next";
        nextBtn.disabled = !schedulerState.selectedDate;
    }
}

function getSelectedDateTimeFromInputs(prefix) {
    const hour = Number(document.getElementById(`${prefix}Hour`)?.value || 0);
    const minute = Number(document.getElementById(`${prefix}Minute`)?.value || 0);
    if (!schedulerState.selectedDate) return null;

    const dt = new Date(schedulerState.selectedDate);
    dt.setHours(hour, minute, 0, 0);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
}

function syncSchedulerDateLabel() {
    const selectedDateLabel = document.getElementById("selectedDateLabel");
    if (!selectedDateLabel) return;
    if (!schedulerState.selectedDate) {
        selectedDateLabel.textContent = "No date selected";
        return;
    }
    selectedDateLabel.textContent = formatDateLocal(schedulerState.selectedDate);
}

function prefillTimeInputsIfChosen() {
    const start = schedulerState.startDateTime;
    const end = schedulerState.endDateTime;
    if (start) {
        document.getElementById("startHour").value = String(start.getHours());
        document.getElementById("startMinute").value = String(start.getMinutes());
    }
    if (end) {
        document.getElementById("endHour").value = String(end.getHours());
        document.getElementById("endMinute").value = String(end.getMinutes());
    }
}

function showTimeStep() {
    const calendarStep = document.getElementById("calendarStep");
    const timeStep = document.getElementById("timeStep");
    const title = document.getElementById("schedulerTitle");
    const backBtn = document.getElementById("schedulerBackBtn");
    const nextBtn = document.getElementById("schedulerNextBtn");
    if (calendarStep) calendarStep.classList.add("d-none");
    if (timeStep) timeStep.classList.remove("d-none");
    if (title) title.textContent = "Choose reservation times";
    if (backBtn) backBtn.classList.remove("d-none");
    if (nextBtn) {
        nextBtn.textContent = "Apply";
        nextBtn.disabled = false;
    }
    syncSchedulerDateLabel();
    prefillTimeInputsIfChosen();
}

function updateReservationSummary() {
    const summary = document.getElementById("reservationSummary");
    if (!summary) return;

    if (!schedulerState.startDateTime || !schedulerState.endDateTime) {
        summary.textContent = "No date and time selected yet.";
        summary.classList.add("text-muted");
        return;
    }

    const start = schedulerState.startDateTime;
    const end = schedulerState.endDateTime;
    summary.textContent = `${start.toLocaleDateString()} - ${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")} to ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
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

    // Manual inputs are the canonical serialized values used by form submission and refreshes.
    if (manualDateInput) {
        manualDateInput.value = schedulerState.startDateTime ? formatDateLocal(schedulerState.startDateTime) : "";
    }
    if (manualStartInput) {
        manualStartInput.value = schedulerState.startDateTime ? formatTimeLocal(schedulerState.startDateTime) : "";
    }
    if (manualEndInput) {
        manualEndInput.value = schedulerState.endDateTime ? formatTimeLocal(schedulerState.endDateTime) : "";
    }
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

    if (!manualDateInput || !manualStartInput || !manualEndInput) {
        return false;
    }

    if (!manualDateInput.value || !manualStartInput.value || !manualEndInput.value) {
        // Partial manual input should not wipe the previously selected scheduler slot while the user is typing.
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
    schedulerState.modal?.hide();
    refreshAvailableRooms().catch(err => {
        setRoomAvailabilityHint(String(err.message || err), true);
    });
    return true;
}

function initSchedulerModal() {
    const modalEl = document.getElementById("schedulerModal");
    const openBtn = document.getElementById("openSchedulerBtn");
    const backBtn = document.getElementById("schedulerBackBtn");
    const nextBtn = document.getElementById("schedulerNextBtn");
    const manualDateInput = document.getElementById("manualDate");
    const manualStartInput = document.getElementById("manualStartTime");
    const manualEndInput = document.getElementById("manualEndTime");

    if (
        !modalEl ||
        !openBtn ||
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
        openBtn.disabled = true;
        openBtn.title = "Scheduler unavailable. Use manual date and time inputs.";
        updateReservationSummary();
        return;
    }

    schedulerState.modal = new bootstrap.Modal(modalEl);
    schedulerState.calendar = flatpickr("#calendarContainer", {
        inline: true,
        // Reservations are constrained to today or later in both the UI and backend validation flow.
        minDate: "today",
        dateFormat: "Y-m-d",
        onChange(selectedDates) {
            schedulerState.selectedDate = selectedDates[0] || null;
            nextBtn.disabled = !schedulerState.selectedDate;
        }
    });

    openBtn.addEventListener("click", () => {
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

    ["startHour", "startMinute", "endHour", "endMinute"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("change", () => {
                updateReservationSummary();
            });
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
