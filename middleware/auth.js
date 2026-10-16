const User = require('../models/User');

async function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  try {
    const account = await User.findById(req.session.user.id).select('username role').lean();
    if (!account) return req.session.destroy(() => res.redirect('/login'));
    req.session.user = { id: String(account._id), username: account.username, role: account.role };
    next();
  } catch (err) { next(err); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send('Bạn không có quyền thực hiện thao tác này.');
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
