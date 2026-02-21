const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Login failed: ${text}`);
        }

        const data = await res.json();
        localStorage.setItem("token", data.token);
        window.location.href = "dashboard.html"; // redirect after login
    } catch (err) {
        alert(err.message);
    }
});