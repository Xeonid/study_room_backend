package utils

import (
	"encoding/json"
	"net/http"
)

// DecodeJSONBody decodes JSON from request body into dst.
// Returns false if error occurs and writes http.Error automatically.
func DecodeJSONBody(w http.ResponseWriter, r *http.Request, dst interface{}) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return false
	}
	return true
}
