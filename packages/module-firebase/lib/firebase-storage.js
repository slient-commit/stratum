/**
 * Cloud Storage wrapper using the Firebase JS SDK (modular v9+).
 * Registered as the firebase.storage service.
 */

const {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  list,
  getMetadata,
} = require('firebase/storage');

function createStorageService(storage) {
  return {
    /**
     * Upload a buffer to Cloud Storage.
     * @param {string} filePath — destination path
     * @param {Buffer|Uint8Array} data — file contents
     * @param {object} [metadata] — optional metadata (contentType, etc.)
     * @returns {{ name, fullPath, downloadURL }}
     */
    async upload(filePath, data, metadata = {}) {
      const fileRef = ref(storage, filePath);
      await uploadBytes(fileRef, data, {
        contentType: metadata.contentType || 'application/octet-stream',
        ...metadata,
      });
      const url = await getDownloadURL(fileRef);
      return {
        name: fileRef.name,
        fullPath: fileRef.fullPath,
        downloadURL: url,
      };
    },

    /**
     * Get a download URL for a file.
     * @param {string} filePath — path in storage
     * @returns {string} — download URL
     */
    async getDownloadURL(filePath) {
      return getDownloadURL(ref(storage, filePath));
    },

    /**
     * Delete a file from Cloud Storage.
     * @param {string} filePath — path in storage
     */
    async delete(filePath) {
      await deleteObject(ref(storage, filePath));
    },

    /**
     * List files in a directory.
     * @param {string} [prefix] — directory prefix (e.g. 'uploads/')
     * @returns {Array<{ name, fullPath }>}
     */
    async list(prefix = '') {
      const folderRef = ref(storage, prefix);
      const result = await list(folderRef);
      const files = [];
      for (const itemRef of result.items) {
        try {
          const meta = await getMetadata(itemRef);
          files.push({
            name: itemRef.name,
            fullPath: itemRef.fullPath,
            size: meta.size,
            updated: meta.updated,
          });
        } catch {
          files.push({ name: itemRef.name, fullPath: itemRef.fullPath });
        }
      }
      return files;
    },
  };
}

module.exports = createStorageService;
