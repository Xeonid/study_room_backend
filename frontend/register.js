const registerForm = document.getElementById("register-form");
const registerError = document.getElementById("register-error");
const registerSuccess = document.getElementById("register-success");

function showError(message) {
    registerError.textContent = message;
    registerError.classList.remove("d-none");
}

function clearError() {
    registerError.textContent = "";
    registerError.classList.add("d-none");
}

function showSuccess(message) {
    registerSuccess.textContent = message;
    registerSuccess.classList.remove("d-none");
}

function clearSuccess() {
    registerSuccess.textContent = "";
    registerSuccess.classList.add("d-none");
}

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    clearError();
    clearSuccess();

    if (!name || !email || !password) {
        showError("Name, email, and password are required.");
        return;
    }

    try {
        const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });

        if (!res.ok) {
            const text = await res.text();
            showError(text || "Registration failed.");
            return;
        }

        showSuccess("Registration successful. Redirecting to login...");
        // Preserve the just-registered identity across the redirect to the dedicated login page.
        localStorage.setItem("registered_name_hint", name);
        localStorage.setItem("registered_email_hint", email);
        registerForm.reset();
        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);
    } catch (err) {
        showError(err.message || "Registration failed.");
    }
});
