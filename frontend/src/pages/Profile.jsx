import React, { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";

const Profile = () => {
  const { user, setUser, loading, isLinkedChild } = useContext(AuthContext);
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setMessage({ type: "error", text: "הסיסמאות החדשות אינן תואמות" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "הסיסמה החדשה חייבת להיות באורך 8 תווים לפחות" });
      return;
    }
    if (currentPassword.length < 8) {
      setMessage({ type: "error", text: "הסיסמה הנוכחית חייבת להיות באורך 8 תווים לפחות" });
      return;
    }
    if (currentPassword === newPassword) {
      setMessage({ type: "error", text: "הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית" });
      return;
    }
    setSaving(true);
    try {
      await api.put("/api/user/password", { currentPassword, newPassword, confirmNewPassword });
      setMessage({ type: "success", text: "הסיסמה שונתה בהצלחה" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.message || "שינוי הסיסמה נכשל" });
    } finally {
      setSaving(false);
      await api.post("/api/logout-all");
      setUser(null);
      navigate("/login");
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/api/logout");
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleLogoutAllDevices = async () => {
    try {
      await api.post("/api/logout-all");
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="sc-loading-page">
        <div className="sc-spinner"></div>
      </div>
    );
  }

  return (
    <div className="page-fade-in" dir="rtl">
      <div className="container py-4">
        <div className="row justify-content-center">
          <div className="col-lg-10">
            <h2 className="fw-bold mb-1">הגדרות חשבון</h2>
            <p className="mb-4" style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>
              נהל את הפרטים והאבטחה של החשבון שלך
            </p>

            {message.text && (
              <div
                className={`alert alert-${message.type === "error" ? "danger" : "success"} d-flex align-items-center`}
                style={{ borderRadius: "10px", fontSize: "0.9rem" }}
              >
                <i className={`bi ${message.type === "success" ? "bi-check-circle" : "bi-exclamation-triangle"} me-2`}></i>
                <span className="flex-grow-1">{message.text}</span>
                <button type="button" className="btn-close" onClick={() => setMessage({ type: "", text: "" })}></button>
              </div>
            )}

            <div className="row g-4 justify-content-center">
              <div className="col-md-8 col-lg-6">
                <div className="sc-glass p-4 mb-4">
                  <h5 className="fw-bold mb-3">
                    <i className="bi bi-shield-lock me-2" style={{ color: "var(--sc-primary)" }}></i>
                    אבטחה
                  </h5>
                  <form onSubmit={handleChangePassword}>
                    <div className="mb-3">
                      <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>סיסמה נוכחית</label>
                      <input type="password" className="form-control sc-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>סיסמה חדשה</label>
                      <input type="password" className="form-control sc-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <div className="mb-4">
                      <label className="form-label fw-semibold" style={{ fontSize: "0.85rem" }}>אישור סיסמה חדשה</label>
                      <input type="password" className="form-control sc-input" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
                    </div>
                    <button type="submit" className="sc-btn sc-btn-ghost w-100" disabled={saving} style={{ padding: "10px" }}>
                      עדכן סיסמה
                    </button>
                  </form>
                </div>

                {/* Family - only for parents */}
                {!isLinkedChild && (
                  <div className="sc-glass p-4 mb-4">
                    <h5 className="fw-bold mb-3">
                      <i className="bi bi-people me-2" style={{ color: "var(--sc-primary)" }}></i>
                      ניהול משפחה
                    </h5>
                    <p style={{ fontSize: "0.85rem", color: "var(--sc-text-muted)" }}>
                      צור חשבונות לילדים כדי לאשר מוצרים שהם מוסיפים
                    </p>
                    <Link to="/family" className="sc-btn sc-btn-primary w-100" style={{ padding: "10px", textDecoration: "none", display: "block", textAlign: "center" }}>
                      <i className="bi bi-people me-1"></i> נהל ילדים
                    </Link>
                  </div>
                )}

                {/* Session */}
                <div className="sc-glass p-4" style={{ borderColor: "rgba(239, 68, 68, 0.2)" }}>
                  <h5 className="fw-bold mb-3" style={{ color: "var(--sc-danger)" }}>
                    <i className="bi bi-box-arrow-right me-2"></i>
                    ניהול הפעלה
                  </h5>
                  <div className="d-grid gap-2">
                    <button className="sc-btn sc-btn-danger w-100" onClick={handleLogout} style={{ padding: "10px" }}>
                      <i className="bi bi-box-arrow-right me-2"></i> התנתק
                    </button>
                    <button className="sc-btn sc-btn-ghost w-100" onClick={handleLogoutAllDevices} style={{ padding: "10px", color: "var(--sc-danger)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                      <i className="bi bi-shield-exclamation me-2"></i> התנתק מכל המכשירים
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
