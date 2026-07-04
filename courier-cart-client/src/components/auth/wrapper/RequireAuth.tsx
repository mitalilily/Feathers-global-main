// components/auth/RequireAuth.tsx
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import FullScreenLoader from "../../UI/loader/FullScreenLoader";
import { useAuth } from "../../../context/auth/AuthContext";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, sessionReady } = useAuth();
  const location = useLocation();

  if (loading || (isAuthenticated && !sessionReady)) return <FullScreenLoader />;
  if (!isAuthenticated) {
    // bounce user to login, keep the page they wanted
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return children;
}
