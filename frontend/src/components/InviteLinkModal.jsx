import React, { useState } from "react";
import api from "../api";

const InviteLinkModal = ({ show, onClose, listId }) => {
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/api/lists/${listId}/invite`);
      setInviteLink(data.inviteLink);
    } catch (err) {
      alert(err.response?.data?.message || "שגיאה ביצירת הקישור");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!show) return null;

  return (
    <div className="sc-modal-overlay" dir="rtl">
      <div className="sc-modal">
        <div className="sc-modal-header">
          <h5>הזמנה לרשימה</h5>
          <button className="sc-icon-btn" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="sc-modal-body">
          {!inviteLink ? (
            <div className="text-center py-3">
              <div className="mb-3" style={{ fontSize: "2.5rem", opacity: 0.4 }}>
                <i className="bi bi-link-45deg"></i>
              </div>
              <p style={{ color: "var(--sc-text-muted)" }}>צור לינק הזמנה כדי להזמין חברים לרשימה</p>
              <button className="sc-btn sc-btn-primary" onClick={generateLink} disabled={loading}>
                {loading && <span className="spinner-border spinner-border-sm me-2"></span>}
                {loading ? "יוצר..." : "צור לינק הזמנה"}
              </button>
            </div>
          ) : (
            <div>
              <p className="fw-semibold mb-2">שתף את הלינק הזה עם חברים:</p>
              <div className="d-flex gap-2">
                <input type="text" className="form-control sc-input flex-grow-1" value={inviteLink} readOnly dir="ltr" style={{ fontSize: "0.85rem" }} />
                <button className="sc-btn sc-btn-primary" onClick={copyLink} style={{ whiteSpace: "nowrap" }}>
                  <i className={`bi ${copied ? "bi-check-lg" : "bi-clipboard"} me-1`}></i>
                  {copied ? "הועתק!" : "העתק"}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="sc-modal-footer">
          <button className="sc-btn sc-btn-ghost" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
};

export default InviteLinkModal;
