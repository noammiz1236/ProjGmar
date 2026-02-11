import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
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
  }, []);

  const handleApply = async (templateId, templateName) => {
    try {
      const { data } = await api.post(`/api/templates/${templateId}/apply`, {
        listName: templateName,
      });
      navigate(`/list/${data.listId}`);
    } catch (err) {
      alert(err.response?.data?.message || "Error creating list from template");
    }
  };

  const handleDelete = async (templateId) => {
    if (!confirm("למחוק את התבנית?")) return;
    try {
      await api.delete(`/api/templates/${templateId}`);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="sc-loading-page">
        <div className="sc-spinner"></div>
      </div>
    );
  }

  return (
    <div className="page-fade-in" dir="rtl">
      <div className="container py-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="fw-bold mb-0">התבניות שלי</h2>
          <button className="sc-btn sc-btn-ghost" onClick={() => navigate("/list")}>
            <i className="bi bi-arrow-right me-1"></i> חזרה לרשימות
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="sc-card">
            <div className="sc-empty">
              <div className="sc-empty-icon"><i className="bi bi-files"></i></div>
              <h4>אין תבניות שמורות</h4>
              <p>שמור רשימה כתבנית מתוך דף הרשימה</p>
            </div>
          </div>
        ) : (
          <div className="row g-3">
            {templates.map((t) => (
              <div key={t.id} className="col-md-6 col-lg-4">
                <div className="sc-card p-4 h-100">
                  <h5 className="fw-bold mb-1">{t.template_name}</h5>
                  <p className="mb-3">
                    <span className="sc-badge sc-badge-muted">{t.item_count} פריטים</span>
                  </p>
                  <div className="d-flex gap-2">
                    <button
                      className="sc-btn sc-btn-primary"
                      style={{ fontSize: "0.85rem", padding: "6px 14px" }}
                      onClick={() => handleApply(t.id, t.template_name)}
                    >
                      <i className="bi bi-plus-circle me-1"></i> צור רשימה מתבנית
                    </button>
                    <button
                      className="sc-icon-btn sc-icon-btn-danger"
                      onClick={() => handleDelete(t.id)}
                      title="מחק תבנית"
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Templates;
