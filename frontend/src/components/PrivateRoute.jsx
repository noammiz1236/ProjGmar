import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function PrivateRoute({ children }) {
  const { user, loading } = useContext(AuthContext);

  // אם עדיין טוען - לא לעשות Redirect
  if (loading) return null;

  // אם אין משתמש - להעביר ל-login
  if (!user) {
    return <Navigate to="/login" />;
  }

  // אם יש משתמש - להמשיך
  return children;
}
