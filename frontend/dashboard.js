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
        clearReservationDraftSelection();
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
