import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { MockModeBadge } from "@/mocks/MockModeBadge";
import Landing from "./pages/Landing";
import CookMode from "./pages/CookMode";
import PlanMode from "./pages/PlanMode";
import ShoppingSummary from "./pages/ShoppingSummary";
import Account from "./pages/Account";

const queryClient = new QueryClient();

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/welcome" replace />;
  }

  return <>{children}</>;
}

// Auth route - redirect to home if already logged in
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Landing page for logged out users */}
      <Route path="/welcome" element={
        <AuthRoute>
          <Landing />
        </AuthRoute>
      } />
      
      {/* Main app - Cook Mode (default for logged in) */}
      <Route path="/" element={
        <ProtectedRoute>
          <CookMode />
        </ProtectedRoute>
      } />
      
      {/* Plan Mode */}
      <Route path="/plan" element={
        <ProtectedRoute>
          <PlanMode />
        </ProtectedRoute>
      } />
      
      {/* Shopping Summary */}
      <Route path="/summary" element={
        <ProtectedRoute>
          <ShoppingSummary />
        </ProtectedRoute>
      } />

      {/* Account */}
      <Route path="/account" element={
        <ProtectedRoute>
          <Account />
        </ProtectedRoute>
      } />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* basename follows Vite's base: "/" on Lovable/dev, "/vega-plan-hub/" on GitHub Pages */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
      {import.meta.env.VITE_MOCK_AUTH === 'true' && <MockModeBadge />}
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
