package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"study_room_backend/internal/auth"
	"study_room_backend/internal/middleware"
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
	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.TrimSpace(body.Email)
	body.Password = strings.TrimSpace(body.Password)
	if body.Name == "" || body.Email == "" || body.Password == "" {
		http.Error(w, "Name, email, and password are required", http.StatusBadRequest)
		return
	}
	body.Role = "student"

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

type profileResponse struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

type updateProfileRequest struct {
	Name            string `json:"name"`
	Email           string `json:"email"`
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
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
	var name, email, hashedPassword, role string
	err := h.DB.QueryRow(`SELECT id, name, email, password, role FROM users WHERE email = ?`, body.Email).
		Scan(&id, &name, &email, &hashedPassword, &role)
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

	utils.JSON(w, http.StatusOK, map[string]string{
		"token": token,
		"name":  name,
		"email": email,
		"role":  role,
	})
}

func (h *AuthHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.UserIDKey).(int)
	if userID <= 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var profile profileResponse
	err := h.DB.QueryRow(`SELECT name, email, role FROM users WHERE id = ?`, userID).
		Scan(&profile.Name, &profile.Email, &profile.Role)
	if err == sql.ErrNoRows {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Failed to load profile", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, profile)
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(middleware.UserIDKey).(int)
	if userID <= 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body updateProfileRequest
	if !utils.DecodeJSONBody(w, r, &body) {
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.TrimSpace(body.Email)
	body.CurrentPassword = strings.TrimSpace(body.CurrentPassword)
	body.NewPassword = strings.TrimSpace(body.NewPassword)
	if body.Name == "" || body.Email == "" {
		http.Error(w, "Name and email are required", http.StatusBadRequest)
		return
	}
	if body.NewPassword != "" && body.CurrentPassword == "" {
		http.Error(w, "Current password is required to set a new password", http.StatusBadRequest)
		return
	}

	var existingName, existingEmail, hashedPassword, role string
	err := h.DB.QueryRow(`SELECT name, email, password, role FROM users WHERE id = ?`, userID).
		Scan(&existingName, &existingEmail, &hashedPassword, &role)
	if err == sql.ErrNoRows {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Failed to load profile", http.StatusInternalServerError)
		return
	}

	emailChanged := !strings.EqualFold(existingEmail, body.Email)
	passwordChanged := body.NewPassword != ""
	if emailChanged || passwordChanged {
		if body.CurrentPassword == "" || !auth.CheckPasswordHash(body.CurrentPassword, hashedPassword) {
			http.Error(w, "Current password is incorrect", http.StatusUnauthorized)
			return
		}
	}

	if emailChanged {
		var exists int
		err = h.DB.QueryRow(`SELECT 1 FROM users WHERE email = ? AND id != ?`, body.Email, userID).Scan(&exists)
		if err == nil {
			http.Error(w, "Email already registered", http.StatusConflict)
			return
		}
		if err != nil && err != sql.ErrNoRows {
			http.Error(w, "Failed to validate email", http.StatusInternalServerError)
			return
		}
	}

	nextPasswordHash := hashedPassword
	if passwordChanged {
		if len(body.NewPassword) < 4 {
			http.Error(w, "New password must be at least 4 characters", http.StatusBadRequest)
			return
		}
		nextPasswordHash, err = auth.HashPassword(body.NewPassword)
		if err != nil {
			http.Error(w, "Failed to hash password", http.StatusInternalServerError)
			return
		}
	}

	_, err = h.DB.Exec(`
		UPDATE users
		SET name = ?, email = ?, password = ?
		WHERE id = ?
	`, body.Name, body.Email, nextPasswordHash, userID)
	if err != nil {
		http.Error(w, "Failed to update profile", http.StatusInternalServerError)
		return
	}

	utils.JSON(w, http.StatusOK, profileResponse{
		Name:  body.Name,
		Email: body.Email,
		Role:  role,
	})
}
