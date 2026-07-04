// pages/auth/Login.tsx
import { Navigate, useLocation } from "react-router-dom";
import FullScreenLoader from "../../components/UI/loader/FullScreenLoader";
import LoginForm from "../../components/auth/LoginForm";
import { useAuth } from "../../context/auth/AuthContext";

export default function Login() {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;
  const returnTo = from ? `${from.pathname}${from.search || ''}` : '/home';

  // optional global loader while figuring out status
  if (loading) return <FullScreenLoader />;

  if (isAuthenticated) {
    // not finished onboarding → push them to questions
    if (user?.onboardingComplete === false) {
      return <Navigate to="/onboarding-questions" replace />;
    }
    // fully onboarded → straight to dashboard
    return <Navigate to={returnTo} replace />;
  }

  // unauthenticated → show the actual login form
  return <LoginForm />;
}
