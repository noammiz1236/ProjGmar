import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000",
  withCredentials: true, // זה מבטיח שהעוגייה תישלח בכל בקשה של api.get/post
});

export default api;
