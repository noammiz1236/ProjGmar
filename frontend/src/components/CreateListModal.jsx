import React, { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import socket from "../socket";

const CreateListModal = ({ show, onClose, onCreated }) => {
  const { user } = useContext(AuthContext);
  const [listName, setListName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!listName.trim()) return;
    setLoading(true);
    socket.emit("create_list", { list_name: listName, userId: user.id }, (response) => {
      setLoading(false);
      if (response.success) {
        setListName("");
        onCreated(response.listId);
        onClose();
      } else {
        alert("שגיאה ביצירת הרשימה");
      }
    });
  };

  if (!show) return null;

  return (
    <div className="sc-modal-overlay" dir="rtl">
      <div className="sc-modal">
        <div className="sc-modal-header">
          <h5>יצירת רשימה חדשה</h5>
          <button className="sc-icon-btn" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="sc-modal-body">
          <label className="form-label fw-semibold" style={{ fontSize: "0.9rem" }}>שם הרשימה</label>
          <input
            type="text"
            className="form-control sc-input"
            placeholder="למשל: קניות לשבת"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
        </div>
        <div className="sc-modal-footer">
          <button className="sc-btn sc-btn-ghost" onClick={onClose}>ביטול</button>
          <button className="sc-btn sc-btn-primary" onClick={handleCreate} disabled={loading || !listName.trim()}>
            {loading ? "יוצר..." : "צור רשימה"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateListModal;
