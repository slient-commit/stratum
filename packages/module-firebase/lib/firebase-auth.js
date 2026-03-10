/**
 * Firebase Auth services that can fill the auth.verifyToken and auth.requireAuth
 * service slots when module-auth is not enabled.
 *
 * Uses Firebase Admin SDK to verify ID tokens issued by Firebase client SDK.
 */

function createAuthServices(adminAuth) {
  /**
   * Verifies a Firebase ID token.
   * Returns the decoded token payload (uid, email, etc.)
   */
  const verifyToken = async (token) => {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      id: decoded.uid,
      uid: decoded.uid,
      username: decoded.name || decoded.email,
      email: decoded.email,
    };
  };

  /**
   * Express middleware that extracts and verifies Bearer token via Firebase Auth.
   * Sets req.user on success.
   */
  const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      req.user = await verifyToken(authHeader.split(' ')[1]);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  return { verifyToken, requireAuth };
}

module.exports = createAuthServices;
