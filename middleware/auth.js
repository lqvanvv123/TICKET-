function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.user.role !== role) {
      return res.redirect(req.session.user.role === "admin" ? "/admin" : "/user");
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
