const { Router } = require('express');

module.exports = function createRbacRoutes(db, requireAuth) {
  const router = Router();

  // Get all roles
  router.get('/roles', requireAuth, async (req, res) => {
    const roles = await db.selectAll('roles');
    res.json(roles);
  });

  // Create a role
  router.post('/roles', requireAuth, async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
      const { id } = await db.insert('roles', { name, description: description || '' });
      res.status(201).json({ id, name, description });
    } catch (err) {
      res.status(409).json({ error: 'Role already exists' });
    }
  });

  // Assign role to user
  router.post('/assign', requireAuth, async (req, res) => {
    const { userId, roleName } = req.body;
    if (!userId || !roleName) {
      return res.status(400).json({ error: 'userId and roleName are required' });
    }

    const role = await db.select('roles', { name: roleName }, ['id']);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    try {
      await db.upsert('user_roles', { user_id: userId, role_id: role.id }, [
        'user_id',
        'role_id',
      ]);
      res.json({ message: `Role "${roleName}" assigned to user ${userId}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get roles for a user
  router.get('/user/:userId', requireAuth, async (req, res) => {
    const userRoles = await db.selectAll('user_roles', {
      user_id: Number(req.params.userId),
    });
    const roles = [];
    for (const ur of userRoles) {
      const role = await db.select('roles', { id: ur.role_id }, ['name', 'description']);
      if (role) roles.push(role);
    }
    res.json(roles);
  });

  // Get permissions for a role
  router.get('/roles/:roleName/permissions', requireAuth, async (req, res) => {
    const role = await db.select('roles', { name: req.params.roleName }, ['id']);
    if (!role) return res.json([]);

    const rolePerms = await db.selectAll('role_permissions', { role_id: role.id });
    const perms = [];
    for (const rp of rolePerms) {
      const perm = await db.select('permissions', { id: rp.permission_id }, [
        'name',
        'description',
      ]);
      if (perm) perms.push(perm);
    }
    res.json(perms);
  });

  return router;
};
