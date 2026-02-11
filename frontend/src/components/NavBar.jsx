import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./NavBar.css";
import { AuthContext } from "../context/AuthContext";
import api from "../api";

const NavBar = () => {
  const { user, setUser, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSearchChange = (e) => setSearchQuery(e.target.value);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    console.log("Searching for:", searchQuery);
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    try {
      await api.post("/api/logout"); // לפי הסרבר שלך
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm sticky-top">
        <div className="container-fluid px-4">
          <Link className="navbar-brand fw-bold fs-5" to="/">
            MyStore
          </Link>

          <button
            className="navbar-toggler d-lg-none"
            type="button"
            onClick={toggleSidebar}
            aria-controls="navbarContent"
            aria-expanded={sidebarOpen}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="navbar-collapse d-none d-lg-flex" id="navbarContent">
            <ul className="navbar-nav mx-auto align-items-center gap-3">
              <li className="nav-item">
                <Link className="btn btn-outline-primary fw-bold" to="/store">
                  Store
                </Link>
              </li>

              <li className="nav-item">
                <form
                  className="d-flex my-2 my-lg-0"
                  onSubmit={handleSearchSubmit}
                >
                  <input
                    className="form-control form-control-sm me-2"
                    type="search"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    style={{ width: "280px" }}
                  />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Go
                  </button>
                </form>
              </li>
            </ul>

            <ul className="navbar-nav ms-auto align-items-center gap-3">
              {loading ? null : user ? (
                <>
                  <li className="nav-item">
                    <span className="nav-link text-primary">
                      {user.first_name}
                    </span>
                  </li>
                  <li className="nav-item">
                    <Link className="btn btn-outline-secondary" to="/profile">
                      <i className="bi bi-gear-fill me-1"></i> Settings
                    </Link>
                  </li>
                  <li className="nav-item">
                    <button
                      className="btn btn-outline-danger"
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <Link className="nav-link text-primary" to="/login">
                      Login
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link className="btn btn-primary" to="/register">
                      Register
                    </Link>
                  </li>
                </>
              )}

              <li className="nav-item">
                <Link
                  to="/cart"
                  className="position-relative nav-link text-dark"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                  </svg>
                  <span className="position-absolute top-0 end-100 translate-middle badge rounded-pill bg-danger">
                    0
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar */}
      <div
        className={`mobile-sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={closeSidebar}
      />
      <div className={`mobile-sidebar ${sidebarOpen ? "open" : ""}`}>
        <ul>
          <li className="search-bar-item">
            <form onSubmit={handleSearchSubmit} className="search-bar-form">
              <input
                className="form-control form-control-sm"
                type="search"
                placeholder="Search..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <button className="btn btn-primary btn-sm" type="submit">
                Go
              </button>
            </form>
          </li>

          <li>
            <Link
              className="btn btn-outline-primary fw-bold"
              to="/store"
              onClick={closeSidebar}
            >
              Store
            </Link>
          </li>

          {loading ? null : user ? (
            <>
              <li>
                <span className="text-primary">{user.first_name}</span>
              </li>
              <li>
                <Link
                  className="btn btn-outline-secondary w-100 my-2"
                  to="/profile"
                  onClick={closeSidebar}
                >
                  <i className="bi bi-gear-fill me-1"></i> Settings
                </Link>
              </li>
              <li>
                <button
                  className="btn btn-outline-danger"
                  onClick={() => {
                    closeSidebar();
                    handleLogout();
                  }}
                >
                  Logout
                </button>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link
                  className="text-primary"
                  to="/login"
                  onClick={closeSidebar}
                >
                  Login
                </Link>
              </li>
              <li>
                <Link
                  className="btn btn-primary"
                  to="/register"
                  onClick={closeSidebar}
                >
                  Register
                </Link>
              </li>
            </>
          )}

          <li>
            <Link
              to="/cart"
              className="position-relative"
              onClick={closeSidebar}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <span className="position-absolute top-0 end-100 translate-middle badge rounded-pill bg-danger">
                0
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
};

export default NavBar;
