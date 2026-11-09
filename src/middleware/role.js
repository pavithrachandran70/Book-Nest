function roleReader(req, res, next) {
  req.role = req.headers['x-role'] || null;
  next();
}

function requireAdmin(req, res, next) {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

module.exports = { roleReader, requireAdmin };
