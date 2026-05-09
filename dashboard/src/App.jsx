import { Routes, Route, Navigate } from 'react-router-dom';
import Login          from './pages/Login.jsx';
import Dashboard      from './pages/Dashboard.jsx';
import Messages       from './pages/Messages.jsx';
import Settings       from './pages/Settings.jsx';
import Billing        from './pages/Billing.jsx';
import Summary        from './pages/Summary.jsx';
import PendingReplies from './pages/PendingReplies.jsx';
import Layout         from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/messages"        element={<Messages />} />
          <Route path="/settings"        element={<Settings />} />
          <Route path="/billing"         element={<Billing />} />
          <Route path="/summary"         element={<Summary />} />
          <Route path="/pending-replies" element={<PendingReplies />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
