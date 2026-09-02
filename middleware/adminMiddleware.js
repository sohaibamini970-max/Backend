const requireSystemAdministrator = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

 const allowedRoles = ["System Administrator", "Project Manager"];

if (!allowedRoles.includes(req.user.role)) {
  return res.status(403).json({ error: 'Only administrator or project manager can manage users' });
}

  next();
};

module.exports = requireSystemAdministrator;
