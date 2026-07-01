// pages/auth/Login.tsx
import { Navigate } from "react-router-dom";
import LoginForm from "../../components/auth/LoginForm";
import { useAuth } from "../../context/auth/AuthContext";

export default function Login() {
  const { isAuthenticated, user, loading } = useAuth();

  // optional global loader while figuring out status
  if (loading) return null;

  if (isAuthenticated) {
    // not finished onboarding → push them to questions
    if (!user?.onboardingComplete) {
      return <Navigate to="/onboarding-questions" replace />;
    }
    // fully onboarded → straight to dashboard
    return <Navigate to="/home" replace />;
  }

  // unauthenticated → show the actual login form
  return <LoginForm />;
}
