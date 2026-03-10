import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@stratum/ui-shell/src/AuthContext';

export default function RolesPage() {
  const { authFetch } = useAuth();
  const [roles, setRoles] = useState([]);
  const [newRole, setNewRole] = useState('');
  const [description, setDescription] = useState('');

  const loadRoles = useCallback(() => {
    authFetch('/api/rbac/roles')
      .then((res) => res.json())
      .then(setRoles)
      .catch(() => {});
  }, [authFetch]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newRole) return;

    await authFetch('/api/rbac/roles', {
      method: 'POST',
      body: JSON.stringify({ name: newRole, description }),
    });

    setNewRole('');
    setDescription('');
    loadRoles();
  };

  return (
    <div className="page">
      <h2>Roles Management</h2>

      <form onSubmit={handleCreate} className="inline-form">
        <input
          type="text"
          placeholder="Role name"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit">Add Role</button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>{role.id}</td>
              <td>{role.name}</td>
              <td>{role.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
