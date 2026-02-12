import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import validator from "validator";

const Register = () => {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const { password, confirmPassword, email, first_name, last_name } = formData;

    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    if (first_name.length < 2 || last_name.length < 2) {
      setError("שם חייב להכיל לפחות 2 תווים");
      return;
    }
    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (!validator.isEmail(email)) {
      setError("כתובת אימייל לא תקינה");
      return;
    }

    setLoading(true);
    try {
      await axios.post("http://localhost:3000/api/register", formData);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "ההרשמה נכשלה. נסה שוב.");
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

        <h2>צור חשבון חדש</h2>
        <p className="sc-auth-subtitle">הצטרף ל-SmartCart ונהל קניות בחכמה</p>

        {error && (
          <div className="alert alert-danger py-2 text-center" style={{ borderRadius: "10px", fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>שם פרטי</label>
              <input type="text" className="form-control sc-input" name="first_name" placeholder="ישראל" value={formData.first_name} onChange={handleChange} required />
            </div>
            <div className="col-6">
              <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>שם משפחה</label>
              <input type="text" className="form-control sc-input" name="last_name" placeholder="ישראלי" value={formData.last_name} onChange={handleChange} required />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>אימייל</label>
            <input type="email" className="form-control sc-input" name="email" placeholder="name@example.com" value={formData.email} onChange={handleChange} required dir="ltr" />
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>סיסמה</label>
            <input type="password" className="form-control sc-input" name="password" placeholder="לפחות 8 תווים" value={formData.password} onChange={handleChange} required />
          </div>

          <div className="mb-4">
            <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>אימות סיסמה</label>
            <input type="password" className="form-control sc-input" name="confirmPassword" placeholder="הקלד שוב את הסיסמה" value={formData.confirmPassword} onChange={handleChange} required />
          </div>

          <button type="submit" className="sc-btn sc-btn-primary w-100" disabled={loading} style={{ padding: "12px", fontSize: "1rem" }}>
            {loading && <span className="spinner-border spinner-border-sm me-2"></span>}
            {loading ? "נרשם..." : "הרשמה"}
          </button>
        </form>

        <p className="text-center mt-4 mb-0" style={{ fontSize: "0.9rem", color: "var(--sc-text-muted)" }}>
          כבר יש לך חשבון?{" "}
          <Link to="/login" style={{ color: "var(--sc-primary)", fontWeight: 600 }}>התחבר כאן</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
