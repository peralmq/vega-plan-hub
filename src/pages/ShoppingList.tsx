import { Navigation } from "@/components/Navigation";
import { ShoppingListGenerator } from "@/components/ShoppingListGenerator";
import { Toaster } from "@/components/ui/toaster";

const ShoppingList = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="py-20">
        <div className="container">
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Shopping <span className="bg-gradient-fun bg-clip-text text-transparent">Lists</span> 🛒
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Generate smart shopping lists from your meal plans! Never forget an ingredient again 📝
            </p>
          </div>
        </div>
      </div>
      <ShoppingListGenerator />
      <Toaster />
    </div>
  );
};

export default ShoppingList;