import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import validator from "validator";
import { useNavigate } from "react-router-dom";

const Register = () => {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { password, confirmPassword, email, first_name, last_name } =
      formData;
    // Validate passwords
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    if (first_name.length < 2 && last_name.length < 2) {
      alert("Name must be at least 2 characters long!");
      return;
    }
    if (password.length < 8) {
      alert("Password must be at least 8 characters long!");
      return;
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      alert("Invalid email format");
      return;
    }

    // Send request
    try {
      await axios.post("http://localhost:5000/api/register", formData);
      console.log("Registration success");
    } catch (error) {
      const message = error.response?.data?.message;

      if (message) {
        alert(`Registration failed: ${message}`); // to change from alert to msg in clinet page
      } else {
        alert("Registration failed: An unexpected error occurred."); // to change from alert to msg in clinet page
      }
    }
    finally {
      navigate("/");
    }
  };

  return (
    <div className="register-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="card shadow">
              <div className="card-body p-5">
                <h2 className="card-title text-center mb-4">הרשמה</h2>

                <form onSubmit={handleSubmit}>
                  {/* First Name */}
                  <div className="mb-3">
                    <label htmlFor="firstName" className="form-label">
                      שם פרטי
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="firstName"
                      name="first_name"
                      placeholder="הכנס שם פרטי"
                      value={formData.first_name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  {/* Last Name */}
                  <div className="mb-3">
                    <label htmlFor="lastName" className="form-label">
                      שם משפחה
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="lastName"
                      name="last_name"
                      placeholder="הכנס שם משפחה"
                      value={formData.last_name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  {/* Email */}
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label">
                      אימייל
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      name="email"
                      placeholder="הכנס אימייל"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="mb-3">
                    <label htmlFor="password" className="form-label">
                      סיסמה
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="password"
                      name="password"
                      placeholder="הכנס סיסמה"
                      value={formData.password}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  {/* Confirm Password */}
                  <div className="mb-3">
                    <label htmlFor="confirmPassword" className="form-label">
                      אימות סיסמה
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="confirmPassword"
                      name="confirmPassword"
                      placeholder="אימות סיסמה"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <button type="submit" className="btn btn-primary w-100 mb-3">
                    הרשמה
                  </button>
                </form>

                {/* Login Link */}
                <div className="text-center">
                  <p className="mb-0">
                    כבר יש לך חשבון?{" "}
                    <Link to="/login" className="text-primary fw-bold">
                      התחבר כאן
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
