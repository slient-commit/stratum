/**
 * Cloud Storage wrapper that provides upload, download URL, and delete operations.
 * Registered as the firebase.storage service.
 */

function createStorageService(bucket) {
  return {
    /**
     * Upload a buffer or stream to Cloud Storage.
     * @param {string} filePath — destination path in the bucket
     * @param {Buffer|Stream} data — file contents
     * @param {object} [metadata] — optional metadata (contentType, etc.)
     * @returns {{ name, bucket, fullPath }}
     */
    async upload(filePath, data, metadata = {}) {
      const file = bucket.file(filePath);
      await file.save(data, {
        metadata: {
          contentType: metadata.contentType || 'application/octet-stream',
          ...metadata,
        },
      });
      return {
        name: file.name,
        bucket: bucket.name,
        fullPath: `gs://${bucket.name}/${file.name}`,
      };
    },

    /**
     * Get a signed download URL for a file.
     * @param {string} filePath — path in the bucket
     * @param {number} [expiresInMs] — expiry in ms from now (default 1 hour)
     * @returns {string} — signed URL
     */
    async getDownloadURL(filePath, expiresInMs = 3600000) {
      const file = bucket.file(filePath);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresInMs,
      });
      return url;
    },

    /**
     * Delete a file from Cloud Storage.
     * @param {string} filePath — path in the bucket
     */
    async delete(filePath) {
      await bucket.file(filePath).delete();
    },

    /**
     * List files in a directory.
     * @param {string} [prefix] — directory prefix (e.g. 'uploads/')
     * @returns {Array<{ name, size, updated }>}
     */
    async list(prefix = '') {
      const [files] = await bucket.getFiles({ prefix });
      return files.map((f) => ({
        name: f.name,
        size: f.metadata.size,
        updated: f.metadata.updated,
      }));
    },
  };
}

module.exports = createStorageService;
