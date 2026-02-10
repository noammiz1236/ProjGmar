import React, { useState } from "react";
import validator from "validator";
import axios from "axios";

function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const handleChange = (e) => {
        setEmail(e.target.value);
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage("");
        setError("");

        if (!validator.isEmail(email)) {
            setError("Invalid email format");
            return;
        }

        try {
            const response = await axios.post("http://localhost:3000/api/forgot-password", { email });
            setMessage(response.data.message);
        } catch (err) {
            setError(err.response?.data?.message);
        }
    }

    return (
        <div className="forgot-password-page">
            <div className="container py-5">
                <div className="row justify-content-center">
                    <div className="col-md-6">
                        <div className="card shadow">
                            <div className="card-body p-5">
                                <h2 className="card-title text-center mb-4">שכחתי סיסמה</h2>
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
                                            required
                                            name="email"
                                            value={email}
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <button type="submit" className="btn btn-primary w-100 mb-3">
                                        אפס סיסמה
                                    </button>
                                </form>
                                {message && <div className="alert alert-success text-center">{message}</div>}
                                {error && <div className="alert alert-danger text-center">{error}</div>}
                                <div className="text-center">
                                    <p className="mb-0">
                                        נזכרת בסיסמה?{" "}
                                        <a href="/login" className="text-primary fw-bold">
                                            התחבר כאן
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
}

export default ForgotPassword;