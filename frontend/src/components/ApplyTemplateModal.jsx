import React, { useState, useEffect } from "react";
import api from "../api";

const ApplyTemplateModal = ({ show, onClose, onApplied }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!show) return;
    const fetchTemplates = async () => {
      try {
        const { data } = await api.get("/api/templates");
        setTemplates(data.templates);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, [show]);

  const handleApply = async (templateId, templateName) => {
    try {
      const { data } = await api.post(`/api/templates/${templateId}/apply`, { listName: templateName });
      onApplied(data.listId);
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || "שגיאה בהחלת התבנית");
    }
  };

  if (!show) return null;

  return (
    <div className="sc-modal-overlay" dir="rtl">
      <div className="sc-modal">
        <div className="sc-modal-header">
          <h5>יצירת רשימה מתבנית</h5>
          <button className="sc-icon-btn" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="sc-modal-body">
          {loading ? (
            <div className="text-center py-3">
              <div className="sc-spinner" style={{ margin: "0 auto" }}></div>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-3">
              <p style={{ color: "var(--sc-text-muted)" }}>אין תבניות שמורות</p>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="sc-card sc-card-interactive p-3 d-flex justify-content-between align-items-center border-0"
                  style={{ background: "var(--sc-bg)", textAlign: "start" }}
                  onClick={() => handleApply(t.id, t.template_name)}
                >
                  <span className="fw-semibold">{t.template_name}</span>
                  <span className="sc-badge sc-badge-muted">{t.item_count} פריטים</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="sc-modal-footer">
          <button className="sc-btn sc-btn-ghost" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
};

export default ApplyTemplateModal;
