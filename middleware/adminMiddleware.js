const requireSystemAdministrator = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (req.user.role !== "System Administrator") {
    return res.status(403).json({
      success: false,
      message: "Only System Administrators can manage users.",
    });
  }

  next();
};

module.exports = requireSystemAdministrator;
