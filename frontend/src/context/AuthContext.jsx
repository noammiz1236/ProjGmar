import { createContext, useEffect, useState, useRef } from "react";
import axios from "axios";
import api, { setAccessToken } from "../api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasInitialized = useRef(false); // to check if needed

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true; // to check if needed

    const initAuth = async () => {
      console.log("Checking for existing session...");
      try {
        // ניסיון שקט לחידוש טוקן בעזרת העוגייה
        const res = await axios.post("http://localhost:3000/api/refresh", {
          withCredentials: true,
        });

        // אם הצלחנו (סטטוס 200)
        const token = res.data.accessToken;
        setAccessToken(token);

        // משיכת פרטי המשתמש
        const userRes = await api.get("/api/me");
        setUser(userRes.data.user);
        console.log("Session restored successfully");
      } catch (err) {
        // --- התיקון מרכזי כאן ---
        // אם הסטטוס הוא 401 או 403, זה פשוט אומר שהמשתמש לא מחובר (אין עוגייה)
        // אנחנו לא מדפיסים שגיאה (error) אלא רק הודעה רגילה ללוג
        if (err.response?.status === 401 || err.response?.status === 403) {
          console.log("No active session found. User is guest.");
        } else {
          // רק שגיאות לא צפויות (כמו שרת כבוי) יודפסו כשגיאה
          console.error("Auth initialization failed:", err.message);
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // הצגת ספינר בזמן הבדיקה הראשונית כדי למנוע "קפיצות" במסך
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
