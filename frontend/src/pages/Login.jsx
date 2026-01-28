import React, { useState, useContext } from "react";
import validator from "validator";
import api from "../api";
import { AuthContext } from "../context/AuthContext";

const Login = () => {
  const { setUser } = useContext(AuthContext);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password.length < 8) {
      alert("Password must be at least 8 characters long!");
      return;
    }

    if (!validator.isEmail(email)) {
      alert("Invalid email format");
      return;
    }

    try {
      const res = await api.post("/api/login", { email, password });

      // חשוב: setUser מהתשובה של /login
      setUser(res.data.user);
    } catch (err) {
      const message = err.response?.data?.message;
      if (message) {
        alert(`Login failed: ${message}`);
      } else {
        alert("Login failed: An unexpected error occurred.");
      }
    }
  };

  return (
    <div className="login-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="card shadow">
              <div className="card-body p-5">
                <h2 className="card-title text-center mb-4">התחברות</h2>

                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label">
                      אימייל
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      placeholder="הכנס אימייל"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="password" className="form-label">
                      סיסמה
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="password"
                      placeholder="הכנס סיסמה"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary w-100 mb-3">
                    התחברות
                  </button>
                </form>

                <div className="text-center">
                  <p className="mb-0">
                    אין לך חשבון?{" "}
                    <a href="/register" className="text-primary fw-bold">
                      הירשם כאן
                    </a>
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

export default Login;
