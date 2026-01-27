import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRecipeComments, RecipeComment } from "@/hooks/useRecipeComments";
import { MessageSquare, Send, Trash2, Edit2, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface RecipeCommentsProps {
  recipeId: string;
}

export function RecipeComments({ recipeId }: RecipeCommentsProps) {
  const { comments, addComment, updateComment, deleteComment, loading } = useRecipeComments(recipeId);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    
    setSubmitting(true);
    try {
      await addComment(newComment);
      setNewComment("");
      toast({ title: "Comment added! 💬" });
    } catch (error) {
      toast({ title: "Error adding comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    
    try {
      await updateComment(id, editContent);
      setEditingId(null);
      toast({ title: "Comment updated!" });
    } catch (error) {
      toast({ title: "Error updating comment", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteComment(id);
      toast({ title: "Comment deleted" });
    } catch (error) {
      toast({ title: "Error deleting comment", variant: "destructive" });
    }
  };

  const startEdit = (comment: RecipeComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="h-24 animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <span className="font-semibold">Your Notes</span>
        <span className="text-xs text-muted-foreground">({comments.length})</span>
      </div>

      {/* Add comment */}
      <div className="flex gap-2 mb-4">
        <Textarea
          placeholder="Add a note about this recipe..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[60px] resize-none"
        />
        <Button 
          size="icon" 
          onClick={handleSubmit}
          disabled={!newComment.trim() || submitting}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Comments list */}
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="p-3 bg-muted/50 rounded-lg">
            {editingId === comment.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[60px] resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleEdit(comment.id)}
                    disabled={!editContent.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(comment.created_at), 'MMM d, yyyy')}
                    {comment.updated_at !== comment.created_at && ' (edited)'}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEdit(comment)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(comment.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No notes yet. Add your first one above!
          </p>
        )}
      </div>
    </Card>
  );
}
