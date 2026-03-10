import { AuthProvider } from './AuthContext';
import AppRouter from './AppRouter';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
