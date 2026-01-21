import React, { useState } from "react";
import { Link } from "react-router-dom";
import validator from "validator";
import axios from "axios";
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Handle login logic here
    if (password.length < 8) {
      alert("Password must be at least 8 characters long!");
      return;
    }

    if (!validator.isEmail(email)) {
      alert("Invalid email format");
      return;
    }

    try {
      await axios.post("http://localhost:3000/api/login", { email, password });
      console.log("Login success");
      // Redirect or update UI on successful login with user data
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
                <h2 className="card-title text-center mb-4">Login</h2>

                <form onSubmit={handleSubmit}>
                  {/* Email */}
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label">
                      Email Address
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="mb-3">
                    <label htmlFor="password" className="form-label">
                      Password
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      id="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <button type="submit" className="btn btn-primary w-100 mb-3">
                    Login
                  </button>
                </form>

                {/* Register Link */}
                <div className="text-center">
                  <p className="mb-0">
                    Don't have an account?{" "}
                    <Link to="/register" className="text-primary fw-bold">
                      Register here
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

export default Login;
