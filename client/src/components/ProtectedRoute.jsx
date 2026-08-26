import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requirePermission }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requirePermission && !hasPermission(requirePermission)) {
    return (
      <div className="page-loading">
        <p>You don't have permission to view this page.</p>
      </div>
    );
  }
  return children;
}
