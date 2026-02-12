import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function PrivateRoute({ children, parentOnly }) {
  const { user, loading, isLinkedChild } = useContext(AuthContext);

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Block child accounts from parent-only pages
  if (parentOnly && isLinkedChild) {
    return <Navigate to="/list" />;
  }

  return children;
}
