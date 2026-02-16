import jwt from "jsonwebtoken";

/**
 * Middleware to authenticate JWT access tokens
 * Expects "Authorization: Bearer <token>" header
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.log('[AUTH] No token provided');
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[AUTH] Token verified, payload:', payload);

    // Verify it's an access token (not refresh)
    if (payload.type !== "access") {
      console.log('[AUTH] Invalid token type:', payload.type);
      return res.status(401).json({ message: "Invalid token type" });
    }

    req.userId = payload.sub;
    console.log('[AUTH] Set req.userId to:', req.userId);
    next();
  } catch (err) {
    console.log('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
