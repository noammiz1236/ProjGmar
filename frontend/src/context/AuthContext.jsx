import { createContext, useEffect, useState, useRef } from "react";
import axios from "axios";
import api, { setAccessToken, API_URL } from "../api";
import socket from "../socket";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLinkedChild, setIsLinkedChild] = useState(false);
  const hasInitialized = useRef(false);

  // Wrapper to persist user to localStorage
  const setUserWithPersistence = (userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true; // to check if needed

    const initAuth = async () => {
      console.log("Checking for existing session...");

      // Try to restore from localStorage first (fast path for page refresh)
      const storedToken = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          setAccessToken(storedToken);
          setUser(userData);
          console.log("Session restored from localStorage");
          setLoading(false);

          // Validate token in background
          api.get("/api/me").catch(() => {
            // Token expired, try refresh
            initAuthFromServer();
          });
          return;
        } catch (e) {
          console.log("Failed to parse stored user data, falling back to server");
        }
      }

      // Fallback: restore from server via refresh token
      await initAuthFromServer();
      setLoading(false);
    };

    const initAuthFromServer = async () => {
      try {
        // ניסיון שקט לחידוש טוקן בעזרת העוגייה
        const res = await axios.post(
          `${API_URL}/api/refresh`,
          {}, // body ריק
          { withCredentials: true } // ← כאן צריך להיות
        );

        // אם הצלחנו (סטטוס 200)
        const token = res.data.accessToken;
        setAccessToken(token);

        // משיכת פרטי המשתמש
        const userRes = await api.get("/api/me");
        const userData = userRes.data.user;
        setUserWithPersistence(userData);

        console.log("Session restored from server");
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
      }
    };

    initAuth();
  }, []);

  // Derive isLinkedChild and register socket room whenever user changes
  useEffect(() => {
    if (user) {
      setIsLinkedChild(!!user.parent_id);
      socket.emit("register_user", user.id);
    } else {
      setIsLinkedChild(false);
    }
  }, [user]);

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
    <AuthContext.Provider value={{ user, setUser: setUserWithPersistence, loading, isLinkedChild }}>
      {children}
    </AuthContext.Provider>
  );
};
