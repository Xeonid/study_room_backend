const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

function showError(message) {
    loginError.textContent = message;
    loginError.classList.remove("d-none");
}

function clearError() {
    loginError.textContent = "";
    loginError.classList.add("d-none");
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    clearError();

    if (!email || !password) {
        showError("Email and password are required.");
        return;
    }

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            const text = await res.text();
            showError(text || "Login failed.");
            return;
        }

        const data = await res.json();
        localStorage.setItem("token", data.token);
        window.location.href = "dashboard.html";
    } catch (err) {
        showError(err.message || "Login failed.");
    }
});
