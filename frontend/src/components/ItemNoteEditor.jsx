import React, { useState } from "react";
import socket from "../socket";

const ItemNoteEditor = ({ item, listId }) => {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note || "");

  const handleSave = () => {
    socket.emit("update_note", { itemId: item.id, listId, note });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mt-1">
        <input
          type="text"
          className="form-control form-control-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="הוסף הערה..."
          autoFocus
        />
      </div>
    );
  }

  return (
    <small
      className="text-muted d-block fst-italic"
      style={{ cursor: "pointer" }}
      onClick={() => setEditing(true)}
    >
      {item.note || "לחץ להוספת הערה..."}
    </small>
  );
};

export default ItemNoteEditor;
