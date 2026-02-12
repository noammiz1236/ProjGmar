import React, { useContext, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api";

const Home = () => {
  const { user, isLinkedChild } = useContext(AuthContext);
  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoadingLists(true);
    api
      .get("/api/lists")
      .then(({ data }) => setLists(data.lists || []))
      .catch(() => {})
      .finally(() => setLoadingLists(false));
  }, [user]);

  if (!user) {
    return (
      <div className="page-fade-in" dir="rtl">
        {/* Hero */}
        <div className="sc-hero text-center py-5">
          <div className="container py-5" style={{ position: "relative" }}>
            <h1 className="display-3 fw-bold mb-3">
              <i className="bi bi-cart3 me-2"></i>SmartCart
            </h1>
            <p className="lead fs-4 mb-4" style={{ opacity: 0.9 }}>
              נהל את רשימות הקניות שלך בצורה חכמה
            </p>
            <p className="mb-4" style={{ opacity: 0.75, maxWidth: "500px", margin: "0 auto" }}>
              שתף רשימות עם המשפחה, השווה מחירים בין רשתות, סרוק ברקודים ועוד
            </p>
            <div className="d-flex gap-3 justify-content-center">
              <Link
                to="/register"
                className="sc-btn"
                style={{ background: "white", color: "var(--sc-primary)", padding: "12px 32px", fontSize: "1rem", fontWeight: 700 }}
              >
                הרשמה חינם
              </Link>
              <Link
                to="/login"
                className="sc-btn"
                style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.4)", padding: "12px 32px", fontSize: "1rem" }}
              >
                התחברות
              </Link>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="container py-5">
          <div className="row g-4 text-center">
            {[
              { icon: "bi-list-check", title: "רשימות משותפות", desc: "צור רשימות קניות ושתף אותן עם בני משפחה או חברים בזמן אמת" },
              { icon: "bi-graph-up-arrow", title: "השוואת מחירים", desc: "חפש מוצרים והשווה מחירים בין רשתות שונות כדי לחסוך" },
              { icon: "bi-upc-scan", title: "סריקת ברקוד", desc: "סרוק ברקוד של מוצר והוסף אותו לרשימה שלך בלחיצה אחת" },
            ].map((f, i) => (
              <div key={i} className="col-md-4">
                <div className="sc-card sc-card-interactive p-4 h-100 text-center">
                  <div
                    className="d-inline-flex align-items-center justify-content-center mb-3"
                    style={{ width: "64px", height: "64px", borderRadius: "16px", background: "rgba(79, 70, 229, 0.08)" }}
                  >
                    <i className={`bi ${f.icon}`} style={{ fontSize: "1.6rem", color: "var(--sc-primary)" }}></i>
                  </div>
                  <h5 className="fw-bold">{f.title}</h5>
                  <p style={{ color: "var(--sc-text-muted)", fontSize: "0.9rem" }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const allQuickActions = [
    { to: "/list", icon: "bi-clipboard-check", label: "הרשימות שלי", color: "#4f46e5" },
    { to: "/store", icon: "bi-shop", label: "חנות", color: "#06b6d4" },
    { to: "/templates", icon: "bi-files", label: "תבניות", color: "#8b5cf6", parentOnly: true },
    { to: "/profile", icon: "bi-gear", label: "הגדרות", color: "#64748b" },
  ];

  const quickActions = allQuickActions.filter(action => !action.parentOnly || !isLinkedChild);

  return (
    <div className="page-fade-in" dir="rtl">
      <div className="container py-4">
        <div className="mb-4">
          <h2 className="fw-bold mb-1">שלום, {user.first_name}!</h2>
          <p style={{ color: "var(--sc-text-muted)" }}>מה נקנה היום?</p>
        </div>

        {/* Quick Actions */}
        <div className="row g-3 mb-4">
          {quickActions.map((a) => (
            <div key={a.to} className="col-6 col-md-3">
              <Link to={a.to} className="text-decoration-none">
                <div className="sc-card sc-card-interactive text-center p-3">
                  <div
                    className="d-inline-flex align-items-center justify-content-center mb-2"
                    style={{ width: "48px", height: "48px", borderRadius: "12px", background: `${a.color}12` }}
                  >
                    <i className={`bi ${a.icon}`} style={{ fontSize: "1.3rem", color: a.color }}></i>
                  </div>
                  <h6 className="fw-bold mb-0" style={{ fontSize: "0.9rem", color: "var(--sc-text)" }}>{a.label}</h6>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {/* Recent Lists */}
        <div className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="sc-section-title">הרשימות שלי</h5>
            <Link to="/list" className="sc-btn sc-btn-ghost" style={{ fontSize: "0.8rem", padding: "4px 12px" }}>
              הצג הכל
            </Link>
          </div>

          {loadingLists ? (
            <div className="text-center py-4">
              <div className="sc-spinner" style={{ margin: "0 auto" }}></div>
            </div>
          ) : lists.length === 0 ? (
            <div className="sc-card">
              <div className="sc-empty" style={{ padding: "2rem" }}>
                <p style={{ color: "var(--sc-text-muted)" }}>
                  {isLinkedChild ? "אין רשימות עדיין" : "אין לך רשימות עדיין"}
                </p>
                {!isLinkedChild && (
                  <Link to="/list" className="sc-btn sc-btn-primary">
                    <i className="bi bi-plus-lg me-1"></i> צור רשימה חדשה
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="row g-3">
              {lists.slice(0, 6).map((list) => (
                <div key={list.id} className="col-md-6 col-lg-4">
                  <Link to={`/list/${list.id}`} className="text-decoration-none">
                    <div className="sc-card sc-card-interactive p-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="fw-bold mb-0" style={{ color: "var(--sc-text)" }}>{list.list_name}</h6>
                        <span className={`sc-badge ${list.role === "admin" ? "sc-badge-primary" : "sc-badge-muted"}`}>
                          {list.role === "admin" ? "מנהל" : "חבר"}
                        </span>
                      </div>
                      <div className="d-flex gap-3" style={{ color: "var(--sc-text-muted)", fontSize: "0.85rem" }}>
                        <span>{list.item_count} פריטים</span>
                        <span>{list.member_count} חברים</span>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
