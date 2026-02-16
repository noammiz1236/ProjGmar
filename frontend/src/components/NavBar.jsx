import React, { useContext, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ThemeContext } from "../context/ThemeContext";
import api from "../api";
import NotificationBell from "./NotificationBell";

const NavBar = () => {
  const { user, setUser, loading, isLinkedChild } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    try {
      await api.post("/api/logout");
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const isActive = (path) => location.pathname === path;

  const allNavLinks = [
    { to: "/list", label: isLinkedChild ? "רשימות" : "הרשימות שלי" },
    { to: "/store", label: "חנות" },
    { to: "/templates", label: "תבניות", parentOnly: true },
  ];
  const navLinks = allNavLinks.filter((link) => !link.parentOnly || !isLinkedChild);

  return (
    <>
      <nav className="sc-navbar">
        <div className="d-flex align-items-center justify-content-between w-100">
          {/* Brand */}
          <Link className="sc-navbar-brand" to="/">
            <i className="bi bi-cart3 me-1"></i> SmartCart
          </Link>

          {/* Mobile toggle */}
          <button
            className="d-lg-none border-0 bg-transparent p-2"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            style={{ fontSize: "1.25rem" }}
          >
            <i className="bi bi-list"></i>
          </button>

          {/* Desktop nav */}
          <div className="d-none d-lg-flex align-items-center gap-2 flex-grow-1 justify-content-center">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                className={`sc-nav-link ${isActive(link.to) ? "active" : ""}`}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop user section */}
          <div className="d-none d-lg-flex align-items-center gap-2">
            <button
              className="sc-icon-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'מצב כהה' : 'מצב בהיר'}
              style={{ fontSize: "1rem" }}
            >
              <i className={`bi bi-${theme === 'light' ? 'moon-stars' : 'sun'}`}></i>
            </button>
            {loading ? null : user ? (
              <>
                <span
                  className="fw-semibold"
                  style={{ color: "var(--sc-primary)", fontSize: "0.9rem" }}
                >
                  {user.first_name}
                </span>
                {!isLinkedChild && <NotificationBell />}
                <Link
                  className="sc-icon-btn"
                  to="/profile"
                  title="הגדרות"
                  style={{ textDecoration: "none" }}
                >
                  <i className="bi bi-gear"></i>
                </Link>
                <button
                  className="sc-btn sc-btn-ghost"
                  onClick={handleLogout}
                  style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                >
                  התנתק
                </button>
              </>
            ) : (
              <>
                <Link
                  className="sc-nav-link"
                  to="/login"
                >
                  התחברות
                </Link>
                <Link
                  className="sc-btn sc-btn-primary"
                  to="/register"
                  style={{ textDecoration: "none", padding: "6px 18px", fontSize: "0.85rem" }}
                >
                  הרשמה
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar */}
      <div
        className={`sc-sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={closeSidebar}
      />
      <div className={`sc-sidebar ${sidebarOpen ? "open" : ""}`} dir="rtl">
        <ul className="sc-sidebar-nav">
          {navLinks.map((link) => (
            <li key={link.to}>
              <Link to={link.to} onClick={closeSidebar}>
                {link.label}
              </Link>
            </li>
          ))}

          <li><div className="sc-divider"></div></li>

          <li>
            <button onClick={toggleTheme}>
              <i className={`bi bi-${theme === 'light' ? 'moon-stars' : 'sun'} me-2`}></i>
              {theme === 'light' ? 'מצב כהה' : 'מצב בהיר'}
            </button>
          </li>

          <li><div className="sc-divider"></div></li>

          {loading ? null : user ? (
            <>
              <li style={{ padding: "8px 16px" }} className="d-flex align-items-center justify-content-between">
                <span style={{ color: "var(--sc-primary)", fontWeight: 600 }}>
                  {user.first_name}
                </span>
                {!isLinkedChild && <NotificationBell />}
              </li>
              <li>
                <Link to="/profile" onClick={closeSidebar}>
                  <i className="bi bi-gear me-2"></i>הגדרות
                </Link>
              </li>
              <li>
                <button
                  onClick={() => {
                    closeSidebar();
                    handleLogout();
                  }}
                  style={{ color: "var(--sc-danger)" }}
                >
                  <i className="bi bi-box-arrow-right me-2"></i>התנתק
                </button>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link to="/login" onClick={closeSidebar}>
                  התחברות
                </Link>
              </li>
              <li>
                <Link to="/register" onClick={closeSidebar} className="sc-sidebar-cta">
                  הרשמה
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </>
  );
};

export default NavBar;
