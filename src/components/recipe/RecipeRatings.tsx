import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./StarRating";
import { useRecipeRatings } from "@/hooks/useRecipeRatings";
import { useFamilyMembers, FamilyMember } from "@/hooks/useFamilyMembers";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RecipeRatingsProps {
  recipeId: string;
}

export function RecipeRatings({ recipeId }: RecipeRatingsProps) {
  const { ratings, setRating, getRatingForMember, getAverageRating, loading: ratingsLoading } = useRecipeRatings(recipeId);
  const { familyMembers, loading: membersLoading } = useFamilyMembers();
  const [expanded, setExpanded] = useState(false);

  const handleRatingChange = async (rating: number, memberId: string | null) => {
    try {
      await setRating(rating, memberId);
      toast({
        title: rating > 0 ? "Rating saved! ⭐" : "Rating removed",
      });
    } catch (error) {
      toast({
        title: "Error saving rating",
        variant: "destructive",
      });
    }
  };

  const avgRating = getAverageRating();
  const myRating = getRatingForMember(null);

  if (ratingsLoading || membersLoading) {
    return (
      <Card className="p-4">
        <div className="h-12 animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Rate This Recipe</span>
          {avgRating !== null && (
            <Badge variant="secondary" className="text-xs">
              Avg: {avgRating.toFixed(1)} ⭐
            </Badge>
          )}
        </div>
        {familyMembers.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            <Users className="h-4 w-4 mr-1" />
            Family
            {expanded ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
          </Button>
        )}
      </div>

      {/* Your rating */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm text-muted-foreground min-w-[60px]">You:</span>
        <StarRating
          rating={myRating}
          onRatingChange={(r) => handleRatingChange(r, null)}
        />
      </div>

      {/* Family members' ratings */}
      {expanded && familyMembers.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-2">
          {familyMembers.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-[60px]">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: member.avatar_color }}
                >
                  {member.name[0].toUpperCase()}
                </div>
                <span className="text-sm text-muted-foreground truncate max-w-[80px]">
                  {member.name}:
                </span>
              </div>
              <StarRating
                rating={getRatingForMember(member.id)}
                onRatingChange={(r) => handleRatingChange(r, member.id)}
                size="sm"
              />
            </div>
          ))}
        </div>
      )}

      {familyMembers.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Add family members in Account to track individual ratings.
        </p>
      )}
    </Card>
  );
}
