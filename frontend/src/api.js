import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // זה מבטיח שהעוגייה תישלח בכל בקשה של api.get/post
});

// משתנה מקומי בתוך הקובץ שיחזיק את ה-Access Token בזיכרון (מאובטח)
let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

// 1. Interceptor לבקשות - הזרקת הטוקן ל-Header
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 2. Interceptor לתגובות - טיפול בטוקן שפג (401)
// api.js - בתוך ה-interceptors.response
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // הגנה: אם השגיאה היא בנתיב ה-refresh עצמו, אל תנסה שוב!
    if (originalRequest.url.includes("/api/refresh")) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // שימוש ב-axios רגיל כאן כדי לא להפעיל את ה-interceptor של עצמנו
        const res = await axios.post(`${API_URL}/api/refresh`, {
          withCredentials: true,
        });
        const newToken = res.data.accessToken;
        setAccessToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
