import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Leaf, Calendar, ChefHat, ShoppingCart, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import heroImage from "@/assets/hero-vegan-meal-planning.jpg";

export default function Landing() {
  const { signInWithGoogle } = useAuth();

  const features = [
    {
      icon: Calendar,
      title: "Plan Your Week",
      description: "Select up to 7 delicious vegan dinners for next week with smart suggestions",
    },
    {
      icon: ChefHat,
      title: "Cook Mode",
      description: "Step-by-step instructions optimized for tablets in the kitchen",
    },
    {
      icon: ShoppingCart,
      title: "Smart Shopping List",
      description: "Auto-generated lists with everything you need for the week",
    },
    {
      icon: Sparkles,
      title: "Variety & Balance",
      description: "AI avoids repetition and maximizes ingredient overlap to reduce waste",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
        
        <div className="relative container py-20 md:py-32">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-primary/10 backdrop-blur-sm">
                <Leaf className="h-10 w-10 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">
                Vegan Weekly Meal Plan
              </h1>
            </div>
            
            <h2 className="text-4xl md:text-6xl font-bold leading-tight">
              Plan your perfect{" "}
              <span className="bg-gradient-fun bg-clip-text text-transparent">
                vegan week
              </span>
              {" "}🌱
            </h2>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Delicious dinners, smart shopping lists, and stress-free cooking. 
              Let us help you eat better, one week at a time.
            </p>

            <Button 
              size="lg" 
              onClick={signInWithGoogle}
              className="bg-gradient-fun text-white text-lg px-8 py-6 rounded-2xl shadow-playful hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container py-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4">How it works</h3>
          <p className="text-muted-foreground text-lg">Simple, delicious, sustainable 🌿</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card 
              key={feature.title}
              className="p-6 text-center hover:shadow-playful transition-all duration-300 hover:scale-105 border-2 border-dashed border-border/50 hover:border-primary/30"
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-fun flex items-center justify-center text-white">
                <feature.icon className="h-7 w-7" />
              </div>
              <h4 className="font-bold text-lg mb-2">{feature.title}</h4>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Preview Section */}
      <div className="container py-20 border-t">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-3xl font-bold mb-8">
            Your week, <span className="bg-gradient-fun bg-clip-text text-transparent">planned</span> 📅
          </h3>
          
          <Card className="p-6 border-2 border-dashed border-primary/20 bg-muted/30">
            <div className="grid grid-cols-7 gap-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                <div key={day} className="text-center">
                  <div className="text-xs font-medium text-muted-foreground mb-2">{day}</div>
                  <div 
                    className={`h-20 rounded-xl flex items-center justify-center text-2xl ${
                      i < 5 
                        ? 'bg-gradient-fun text-white' 
                        : 'border-2 border-dashed border-border/50'
                    }`}
                  >
                    {i < 5 ? '🍲' : '+'}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-muted-foreground">
              Plan 7 dinners → Get shopping list → Cook with ease
            </p>
          </Card>

          <Button 
            size="lg" 
            onClick={signInWithGoogle}
            className="mt-8 bg-gradient-fun text-white rounded-2xl shadow-playful hover:shadow-glow transition-all"
          >
            Get Started Free
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container text-center text-muted-foreground text-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Leaf className="h-4 w-4 text-primary" />
            <span className="font-medium">Vegan Weekly Meal Plan</span>
          </div>
          <p>Eat plants, save the planet 🌍</p>
        </div>
      </footer>
    </div>
  );
}
