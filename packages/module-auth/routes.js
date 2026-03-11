const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = function createAuthRoutes(db, config, events) {
  const router = Router();
  const secret = config.jwtSecret || 'change-me';
  const expiry = config.tokenExpiry || '24h';

  // Register
  router.post('/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email, and password are required' });
      }

      // Check for existing user (OR condition — two selects for cross-adapter compatibility)
      const byName = await db.select('users', { username }, ['id']);
      const byEmail = !byName ? await db.select('users', { email }, ['id']) : null;
      if (byName || byEmail) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const hash = await bcrypt.hash(password, 10);
      const { id } = await db.insert('users', { username, email, password_hash: hash });

      const user = { id, username, email };

      await events.emit('user.created', user);

      const token = jwt.sign({ id: user.id, username }, secret, { expiresIn: expiry });
      res.status(201).json({ user, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
      }

      const user = await db.select('users', { username });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, secret, {
        expiresIn: expiry,
      });

      res.json({
        user: { id: user.id, username: user.username, email: user.email },
        token,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get current user
  router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], secret);
      const user = await db.select('users', { id: decoded.id }, [
        'id',
        'username',
        'email',
        'created_at',
      ]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
};
