import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./NavBar.css";

const NavBar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    console.log("Searching for:", searchQuery);
    // Add search functionality here
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-light bg-light shadow-sm sticky-top">
        <div className="container-fluid px-4">
          {/* Logo */}
          <Link className="navbar-brand fw-bold fs-5" to="/">
            MyStore
          </Link>

          {/* Toggler for mobile */}
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

          {/* Navbar Content - Desktop */}
          <div className="navbar-collapse d-none d-lg-flex" id="navbarContent">
            {/* Middle Section - Store and Search */}
            <ul className="navbar-nav mx-auto align-items-center gap-3">
              {/* Store Link - More Prominent */}
              <li className="nav-item">
                <Link className="btn btn-outline-primary fw-bold" to="/store">
                  Store
                </Link>
              </li>

              {/* Search Bar - Smaller */}
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

            {/* Right Side Navigation */}
            <ul className="navbar-nav ms-auto align-items-center gap-3">
              {/* Login */}
              <li className="nav-item">
                <Link className="nav-link text-primary" to="/login">
                  Login
                </Link>
              </li>

              {/* Register */}
              <li className="nav-item">
                <Link className="btn btn-primary" to="/register">
                  Register
                </Link>
              </li>

              {/* Cart Icon */}
              <li className="nav-item">
                <a
                  href="/cart"
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
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                    0
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`mobile-sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={closeSidebar}
      />

      {/* Mobile Sidebar */}
      <div className={`mobile-sidebar ${sidebarOpen ? "open" : ""}`}>
        <ul>
          {/* Search Bar - First */}
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

          {/* Store Link */}
          <li>
            <Link
              className="btn btn-outline-primary fw-bold"
              to="/store"
              onClick={closeSidebar}
            >
              Store
            </Link>
          </li>

          {/* Login */}
          <li>
            <Link className="text-primary" to="/login" onClick={closeSidebar}>
              Login
            </Link>
          </li>

          {/* Register */}
          <li>
            <Link
              className="btn btn-primary"
              to="/register"
              onClick={closeSidebar}
            >
              Register
            </Link>
          </li>

          {/* Cart Icon */}
          <li>
            <a
              href="/cart"
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
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                0
              </span>
            </a>
          </li>
        </ul>
      </div>
    </>
  );
};

export default NavBar;
