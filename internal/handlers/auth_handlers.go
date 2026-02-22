package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"study_room_backend/internal/auth"
	"study_room_backend/internal/utils"
)

type AuthHandler struct {
	DB *sql.DB
}

type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role,omitempty"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body RegisterRequest
	if !utils.DecodeJSONBody(w, r, &body) {
		return
	}

	if body.Role == "" {
		body.Role = "student"
	}

	var exists int
	err := h.DB.QueryRow(`SELECT 1 FROM users WHERE email = ?`, body.Email).Scan(&exists)
	if err == nil {
		http.Error(w, "Email already registered", http.StatusConflict)
		return
	}

	hashedPassword, err := auth.HashPassword(body.Password)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	_, err = h.DB.Exec(`
		INSERT INTO users (name, email, password, role)
		VALUES (?, ?, ?, ?)
	`, body.Name, body.Email, hashedPassword, body.Role)
	if err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusCreated, map[string]string{"message": "User registered"})
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body LoginRequest
	if !utils.DecodeJSONBody(w, r, &body) {
		return
	}

	body.Email = strings.TrimSpace(body.Email)
	body.Password = strings.TrimSpace(body.Password)
	if body.Email == "" || body.Password == "" {
		http.Error(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	var id int
	var hashedPassword, role string
	err := h.DB.QueryRow(`SELECT id, password, role FROM users WHERE email = ?`, body.Email).
		Scan(&id, &hashedPassword, &role)
	if err == sql.ErrNoRows {
		http.Error(w, "Account not found", http.StatusUnauthorized)
		return
	}

	if err != nil {
		http.Error(w, "Failed to login", http.StatusInternalServerError)
		return
	}

	if !auth.CheckPasswordHash(body.Password, hashedPassword) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := auth.CreateJWT(id, role)
	if err != nil {
		http.Error(w, "Failed to create token", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"token": token})
}
