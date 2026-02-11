import React, { useState } from "react";
import api from "../api";

const SaveAsTemplateModal = ({ show, onClose, listId }) => {
  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!templateName.trim()) return;
    setLoading(true);
    try {
      await api.post("/api/templates", { listId, templateName });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setTemplateName("");
        onClose();
      }, 1500);
    } catch (err) {
      alert(err.response?.data?.message || "שגיאה בשמירת התבנית");
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="sc-modal-overlay" dir="rtl">
      <div className="sc-modal">
        <div className="sc-modal-header">
          <h5>שמירה כתבנית</h5>
          <button className="sc-icon-btn" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="sc-modal-body">
          {saved ? (
            <div className="text-center py-3">
              <i className="bi bi-check-circle" style={{ fontSize: "2.5rem", color: "var(--sc-success)" }}></i>
              <p className="fw-bold mt-2" style={{ color: "var(--sc-success)" }}>התבנית נשמרה בהצלחה!</p>
            </div>
          ) : (
            <>
              <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>שם התבנית</label>
              <input
                type="text"
                className="form-control sc-input"
                placeholder="למשל: קניות שבועיות"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </>
          )}
        </div>
        {!saved && (
          <div className="sc-modal-footer">
            <button className="sc-btn sc-btn-ghost" onClick={onClose}>ביטול</button>
            <button className="sc-btn sc-btn-primary" onClick={handleSave} disabled={loading || !templateName.trim()}>
              {loading ? "שומר..." : "שמור תבנית"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SaveAsTemplateModal;
