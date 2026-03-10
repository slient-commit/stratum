/**
 * Firebase Auth services using the official Firebase JS SDK.
 *
 * For backend token verification, decodes Firebase ID tokens as JWTs
 * using Google's public keys (no Admin SDK needed).
 */

const jwt = require('jsonwebtoken');
const https = require('https');

let _cachedKeys = null;
let _cacheExpiry = 0;

/**
 * Fetch Google's public certificates for Firebase token verification.
 * Cached until the Cache-Control max-age expires.
 */
function fetchPublicKeys() {
  return new Promise((resolve, reject) => {
    https.get(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            _cachedKeys = JSON.parse(data);
            // Parse max-age from Cache-Control header
            const cacheControl = res.headers['cache-control'] || '';
            const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
            _cacheExpiry = Date.now() + (maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1000 : 3600000);
            resolve(_cachedKeys);
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      }
    ).on('error', reject);
  });
}

async function getPublicKeys() {
  if (_cachedKeys && Date.now() < _cacheExpiry) return _cachedKeys;
  return fetchPublicKeys();
}

function createAuthServices(firebaseAuth, projectId) {
  /**
   * Verifies a Firebase ID token using Google's public certs.
   * Returns the decoded token payload.
   */
  const verifyToken = async (token) => {
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    const kid = header.kid;

    const keys = await getPublicKeys();
    const cert = keys[kid];
    if (!cert) throw new Error('Invalid token: unknown key ID');

    const decoded = jwt.verify(token, cert, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });

    return {
      id: decoded.sub || decoded.user_id,
      uid: decoded.sub || decoded.user_id,
      username: decoded.name || decoded.email,
      email: decoded.email,
    };
  };

  /**
   * Express middleware that extracts and verifies Bearer token.
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
