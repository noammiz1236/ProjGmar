import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import axios from "axios";
import api from "../api";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { user, setUser, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  // Local state for form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // UI States
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async (e) => {
    // to handle update profile ******************************************************
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/api/user", {
        firstName,
        lastName,
        email,
      });
      setMessage({ type: "success", text: "הפרטים עודכנו בהצלחה" });
    } catch (err) {
      setMessage({ type: "error", text: "שגיאה בעדכון הפרטים" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setMessage({ type: "error", text: "הסיסמאות החדשות אינן תואמות" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "הסיסמה החדשה חייבת להיות באורך 8 תווים לפחות",
      });
      return;
    }
    if (currentPassword.length < 8) {
      setMessage({
        type: "error",
        text: "הסיסמה הנוכחית חייבת להיות באורך 8 תווים לפחות",
      });
      return;
    }
    if (currentPassword === newPassword) {
      setMessage({
        type: "error",
        text: "הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית",
      });
      return;
    }
    setSaving(true);

    try {
      await api.put("/api/user/password", {
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setMessage({
        type: "success",
        text: "הסיסמה שונתה בהצלחה",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: err.response?.data?.message || "שינוי הסיסמה נכשל",
      });
    } finally {
      setSaving(false);
      await api.post("/api/logout-all");
      setUser(null);
      navigate("/login");
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/api/logout"); // לפי הסרבר
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

  if (loading)
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">טוען...</span>
        </div>
      </div>
    );

  return (
    <div className="container py-5 fade-in" dir="rtl">
      {" "}
      {/*move to another comp */}
      <style>
        {`
                    .fade-in { animation: fadeIn 0.5s ease-in; }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                    .glass-card {
                        background: rgba(255, 255, 255, 0.95);
                        backdrop-filter: blur(10px);
                        border-radius: 16px;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
                    }
                    .form-control:focus {
                        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.15);
                        border-color: #8bb9fe;
                    }
                    .btn-primary-gradient {
                        background: linear-gradient(135deg, #0d6efd 0%, #0043a8 100%);
                        border: none;
                        transition: transform 0.2s, box-shadow 0.2s;
                    }
                    .btn-primary-gradient:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(13, 110, 253, 0.3);
                    }
                    .section-title {
                        font-weight: 700;
                        color: #2c3e50;
                        margin-bottom: 1.5rem;
                        position: relative;
                        padding-bottom: 0.5rem;
                    }
                    .section-title::after {
                        content: '';
                        position: absolute;
                        bottom: 0;
                        right: 0; /* Changed from left to right for RTL */
                        width: 50px;
                        height: 4px;
                        background: #0d6efd;
                        border-radius: 2px;
                    }
                `}
      </style>
      <div className="row justify-content-center">
        <div className="col-lg-10">
          <h1 className="mb-4 fw-bold text-dark text-center">הגדרות חשבון</h1>{" "}
          {/*to change */}
          {message.text && (
            <div
              className={`alert alert-${message.type === "error" ? "danger" : message.type === "success" ? "success" : "info"} alert-dismissible fade show shadow-sm`}
              role="alert"
            >
              {message.type === "success" && (
                <i className="bi bi-check-circle-fill me-2"></i>
              )}
              {message.type === "error" && (
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
              )}
              {message.text}
              <button
                type="button"
                className="btn-close"
                onClick={() => setMessage({ type: "", text: "" })}
              ></button>
            </div>
          )}
          <div className="row g-4">
            {/* Left Column: Personal Info & Account Actions */}
            <div className="col-md-6">
              {/* Personal Details Card */}
              <div className="glass-card p-4 mb-4 h-100">
                <h3 className="section-title">פרטים אישיים</h3>
                <form onSubmit={handleUpdateProfile}>
                  {" "}
                  {/* to handle update profile */}
                  <div className="mb-3">
                    <label className="form-label text-muted small fw-bold text-uppercase">
                      שם פרטי
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg bg-light border-0"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-muted small fw-bold text-uppercase">
                      שם משפחה
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg bg-light border-0"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div className="mb-4">
                    <label className="form-label text-muted small fw-bold text-uppercase">
                      כתובת אימייל
                    </label>
                    <input
                      type="email"
                      className="form-control form-control-lg bg-light border-0"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div className="d-grid">
                    <button
                      type="submit"
                      className="btn btn-primary btn-primary-gradient btn-lg text-white"
                      disabled={saving}
                    >
                      {saving ? "שומר..." : "שמור שינויים"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right Column: Security & Danger Zone */}
            <div className="col-md-6">
              {/* Change Password Card */}
              <div className="glass-card p-4 mb-4">
                <h3 className="section-title">אבטחה</h3>
                <form onSubmit={handleChangePassword}>
                  <div className="mb-3">
                    <label className="form-label text-muted small fw-bold text-uppercase">
                      סיסמה נוכחית
                    </label>
                    <input
                      type="password"
                      className="form-control bg-light border-0"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder=""
                      name="currentPassword"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-muted small fw-bold text-uppercase">
                      סיסמה חדשה
                    </label>
                    <input
                      type="password"
                      className="form-control bg-light border-0"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder=""
                      name="newPassword"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="form-label text-muted small fw-bold text-uppercase">
                      אישור סיסמה חדשה
                    </label>
                    <input
                      type="password"
                      className="form-control bg-light border-0"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder=""
                      name="confirmNewPassword"
                    />
                  </div>
                  <div className="d-grid">
                    <button
                      type="submit"
                      className="btn btn-outline-primary btn-lg"
                      disabled={saving}
                    >
                      עדכן סיסמה
                    </button>
                  </div>
                </form>
              </div>

              {/* Account Actions Card */}
              <div
                className="glass-card p-4 border-danger border-opacity-25"
                style={{ background: "rgba(255, 240, 240, 0.5)" }}
              >
                <h3 className="section-title text-danger">ניהול הפעלה</h3>
                <div className="d-grid gap-3">
                  <button
                    onClick={handleLogout}
                    className="btn btn-danger btn-lg shadow-sm"
                  >
                    <i className="bi bi-box-arrow-right me-2"></i> התנתק
                  </button>
                  <button
                    onClick={handleLogoutAllDevices}
                    className="btn btn-outline-danger btn-lg"
                    title="Logs out from all devices (Mocked)"
                  >
                    <i className="bi bi-shield-lock me-2"></i> התנתק מכל
                    המכשירים
                  </button>
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
