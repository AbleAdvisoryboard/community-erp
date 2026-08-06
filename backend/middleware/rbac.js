export function requirePermission(required) {
  const requiredPermissions = Array.isArray(required) ? required : [required];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const userPerms = new Set(req.user.permissions || []);
    const allowed = requiredPermissions.every((perm) => userPerms.has(perm));
    if (!allowed) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

export function requireRole(required) {
  const requiredRoles = Array.isArray(required) ? required : [required];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const userRoles = new Set((req.user.roles || []).map((role) => role.name));
    const allowed = requiredRoles.some((role) => userRoles.has(role));
    if (!allowed) {
      return res.status(403).json({ message: "Insufficient role assignment" });
    }
    return next();
  };
}
