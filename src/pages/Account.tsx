import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { FamilyMembersManager } from "@/components/account/FamilyMembersManager";
import { ChefHat, LogOut, ArrowLeft, User } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompassionFooter } from "@/components/CompassionFooter";

export default function Account() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/welcome');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background shadow-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <User className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">Account</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ChefHat className="h-4 w-4 mr-2" />
                Cook
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-6 max-w-2xl">
        {/* User Info */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-4">
            {user?.user_metadata?.avatar_url ? (
              <img 
                src={user.user_metadata.avatar_url} 
                alt="Profile"
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">
                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
              </h2>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </Card>

        {/* Family Members */}
        <FamilyMembersManager />

        {/* Sign Out */}
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
      <CompassionFooter />
    </div>
  );
}
