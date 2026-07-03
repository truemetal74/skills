import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, isLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pr-light">
        <Loader2 className="h-10 w-10 text-pr-main animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return user ? <>{children}</> : null;
};

export default AuthGuard;
