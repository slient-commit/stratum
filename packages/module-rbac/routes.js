const { Router } = require('express');

module.exports = function createRbacRoutes(db, requireAuth) {
  const router = Router();

  // Get all roles
  router.get('/roles', requireAuth, (req, res) => {
    const roles = db.all('SELECT * FROM roles');
    res.json(roles);
  });

  // Create a role
  router.post('/roles', requireAuth, (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
      const result = db.run(
        'INSERT INTO roles (name, description) VALUES (?, ?)',
        [name, description || '']
      );
      res.status(201).json({ id: Number(result.lastInsertRowid), name, description });
    } catch (err) {
      res.status(409).json({ error: 'Role already exists' });
    }
  });

  // Assign role to user
  router.post('/assign', requireAuth, (req, res) => {
    const { userId, roleName } = req.body;
    if (!userId || !roleName) {
      return res.status(400).json({ error: 'userId and roleName are required' });
    }

    const role = db.get('SELECT id FROM roles WHERE name = ?', [roleName]);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    try {
      db.run('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        userId,
        role.id,
      ]);
      res.json({ message: `Role "${roleName}" assigned to user ${userId}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get roles for a user
  router.get('/user/:userId', requireAuth, (req, res) => {
    const roles = db.all(
      `SELECT r.name, r.description FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
      [req.params.userId]
    );
    res.json(roles);
  });

  // Get permissions for a role
  router.get('/roles/:roleName/permissions', requireAuth, (req, res) => {
    const perms = db.all(
      `SELECT p.name, p.description FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
       WHERE r.name = ?`,
      [req.params.roleName]
    );
    res.json(perms);
  });

  return router;
};
