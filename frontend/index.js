const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

const registerForm = document.getElementById("register-form");
const registerError = document.getElementById("register-error");
const registerSuccess = document.getElementById("register-success");
const loginTabBtn = document.getElementById("login-tab");

function toggleAlert(element, message) {
    if (!message) {
        element.textContent = "";
        element.classList.add("d-none");
        return;
    }

    element.textContent = message;
    element.classList.remove("d-none");
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();

    toggleAlert(loginError, "");

    if (!email || !password) {
        toggleAlert(loginError, "Email and password are required.");
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
            toggleAlert(loginError, text || "Login failed.");
            return;
        }

        const data = await res.json();
        localStorage.setItem("token", data.token);
        localStorage.setItem("user_email", (data.email || email).trim());
        localStorage.setItem("user_role", String(data.role || "student").trim().toLowerCase());

        // Keep the dashboard bootstrap fast after redirect without waiting on a separate profile request.
        if ((data.name || "").trim()) {
            localStorage.setItem("user_name", data.name.trim());
        } else {
            localStorage.removeItem("user_name");
        }

        localStorage.removeItem("registered_name_hint");
        localStorage.removeItem("registered_email_hint");

        window.location.href = "dashboard.html";
    } catch (err) {
        toggleAlert(loginError, err.message || "Login failed.");
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value.trim();

    toggleAlert(registerError, "");
    toggleAlert(registerSuccess, "");

    if (!name || !email || !password) {
        toggleAlert(registerError, "Name, email, and password are required.");
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
            toggleAlert(registerError, text || "Registration failed.");
            return;
        }

        registerForm.reset();
        // These hints survive the tab switch so follow-up login UI can reuse the just-registered identity.
        localStorage.setItem("registered_name_hint", name);
        localStorage.setItem("registered_email_hint", email);
        toggleAlert(registerSuccess, "Registration successful. Please login.");
        bootstrap.Tab.getOrCreateInstance(loginTabBtn).show();
    } catch (err) {
        toggleAlert(registerError, err.message || "Registration failed.");
    }
});
