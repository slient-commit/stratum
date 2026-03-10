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

      const existing = db.get(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );
      if (existing) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const hash = await bcrypt.hash(password, 10);
      const result = db.run(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [username, email, hash]
      );

      const user = { id: Number(result.lastInsertRowid), username, email };

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

      const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
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
  router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], secret);
      const user = db.get('SELECT id, username, email, created_at FROM users WHERE id = ?', [
        decoded.id,
      ]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
};
