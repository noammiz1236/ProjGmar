import React, { useState } from "react";
import { Link } from "react-router-dom";
import validator from "validator";
import axios from "axios";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!validator.isEmail(email)) {
      setError("כתובת אימייל לא תקינה");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post("http://localhost:3000/api/forgot-password", { email });
      setMessage(response.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "שגיאה בשליחת הבקשה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sc-auth-page" dir="rtl">
      <div className="sc-auth-card page-fade-in">
        <div className="text-center mb-4">
          <Link to="/" style={{ textDecoration: "none" }}>
            <span className="sc-text-gradient" style={{ fontSize: "2rem", fontWeight: 800 }}>
              <i className="bi bi-cart3"></i> SmartCart
            </span>
          </Link>
        </div>

        <h2>שכחת סיסמה?</h2>
        <p className="sc-auth-subtitle">הכנס את האימייל שלך ונשלח לך קישור לאיפוס</p>

        {message && (
          <div className="alert alert-success py-2 text-center" style={{ borderRadius: "10px", fontSize: "0.9rem" }}>
            {message}
          </div>
        )}
        {error && (
          <div className="alert alert-danger py-2 text-center" style={{ borderRadius: "10px", fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>אימייל</label>
            <input type="email" className="form-control sc-input" placeholder="name@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          </div>

          <button type="submit" className="sc-btn sc-btn-primary w-100" disabled={loading} style={{ padding: "12px", fontSize: "1rem" }}>
            {loading && <span className="spinner-border spinner-border-sm me-2"></span>}
            {loading ? "שולח..." : "שלח קישור איפוס"}
          </button>
        </form>

        <p className="text-center mt-4 mb-0" style={{ fontSize: "0.9rem", color: "var(--sc-text-muted)" }}>
          נזכרת בסיסמה?{" "}
          <Link to="/login" style={{ color: "var(--sc-primary)", fontWeight: 600 }}>התחבר כאן</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
