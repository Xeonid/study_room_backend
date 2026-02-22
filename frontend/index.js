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
    const role = document.getElementById("register-role").value;

    toggleAlert(registerError, "");
    toggleAlert(registerSuccess, "");

    if (!name || !email || !password || !role) {
        toggleAlert(registerError, "Name, email, password, and role are required.");
        return;
    }

    try {
        const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, role })
        });

        if (!res.ok) {
            const text = await res.text();
            toggleAlert(registerError, text || "Registration failed.");
            return;
        }

        registerForm.reset();
        toggleAlert(registerSuccess, "Registration successful. Please login.");
        bootstrap.Tab.getOrCreateInstance(loginTabBtn).show();
    } catch (err) {
        toggleAlert(registerError, err.message || "Registration failed.");
    }
});
