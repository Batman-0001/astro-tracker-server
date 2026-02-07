/**
 * Admin authorization middleware.
 * Must be used AFTER the auth middleware.
 * Checks that the authenticated user has the 'admin' role.
 */
const adminAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required.",
    });
  }

  next();
};

export default adminAuth;
