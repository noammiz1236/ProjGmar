import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import api from "../api";
import socket from "../socket";

const ItemComments = ({ itemId, listId }) => {
  const { user } = useContext(AuthContext);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const { data } = await api.get(`/api/lists/${listId}/items/${itemId}/comments`);
        setComments(data.comments);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchComments();

    const handleNewComment = (data) => {
      if (data.itemId === itemId) {
        setComments((prev) => [...prev, data.comment]);
      }
    };
    socket.on("receive_comment", handleNewComment);
    return () => socket.off("receive_comment", handleNewComment);
  }, [itemId, listId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    socket.emit("add_comment", {
      itemId,
      listId,
      userId: user.id,
      comment: newComment,
    });
    setNewComment("");
  };

  return (
    <div className="mt-2 border-top pt-2" dir="rtl">
      {loading ? (
        <small className="text-muted">טוען הערות...</small>
      ) : (
        <>
          {comments.map((c) => (
            <div key={c.id} className="mb-1">
              <small>
                <strong>{c.user_name}</strong>: {c.comment}
              </small>
            </div>
          ))}
          {comments.length === 0 && (
            <small className="text-muted">אין הערות עדיין</small>
          )}
        </>
      )}
      <form onSubmit={handleSubmit} className="d-flex gap-1 mt-1">
        <input
          type="text"
          className="form-control form-control-sm"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="הוסף הערה..."
        />
        <button className="btn btn-sm btn-primary" type="submit">
          שלח
        </button>
      </form>
    </div>
  );
};

export default ItemComments;
