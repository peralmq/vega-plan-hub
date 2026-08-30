import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferenceAdmin } from "@/hooks/usePreferenceAdmin";
import { formatSinceDate, type PreferenceRow } from "@/lib/productPreferences";
import { Brain, ChevronDown, ChevronUp, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// "What the bot believes" (p4-04, Script 3 / research-plan A.8): the
// inspectability contract made visible on the web — every current product
// preference the household has taught Vega, with its history, editable and
// deletable in place. Same append-only store the chat [New usual]/[Undo]
// flow writes to (src/lib/productPreferences), so an edit here is exactly
// what a chat correction does: a new row, source='explicit', superseding
// the one shown — never an in-place update.
export function PreferenceBeliefs() {
  const { groups, loading, editPreference, deletePreference } = usePreferenceAdmin();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startEdit = (row: PreferenceRow) => {
    setEditingKey(row.canonical_ingredient);
    setEditValue(row.product_name);
  };

  const handleSave = async (row: PreferenceRow) => {
    setBusyKey(row.canonical_ingredient);
    try {
      await editPreference(row, editValue);
      setEditingKey(null);
      toast({ title: "Belief updated 🌱" });
    } catch (error) {
      toast({ title: "Error updating preference", variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (row: PreferenceRow) => {
    setBusyKey(row.canonical_ingredient);
    try {
      await deletePreference(row);
      toast({ title: "Forgotten — back to unmatched" });
    } catch (error) {
      toast({ title: "Error removing preference", variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-32 animate-pulse bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">🌱 What Vega believes</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Product preferences taught in chat ("vi har bytt till...") or corrected on the list.
        Editing here writes a new belief, same as a chat correction — nothing is ever overwritten.
      </p>

      <div className="space-y-3">
        {groups.map((group) => {
          const key = group.canonicalIngredient;
          const isExpanded = expanded.has(key);
          const isEditing = editingKey === key;
          const isBusy = busyKey === key;

          return (
            <div key={key} className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-muted-foreground">{group.canonicalIngredient} → </span>
                  {isEditing ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave(group.current)}
                      className="h-8 inline-block w-auto"
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium">{group.current.product_name}</span>
                  )}
                  {!isEditing && (
                    <span className="text-xs text-muted-foreground ml-2">
                      since {formatSinceDate(group.current.valid_from)}
                    </span>
                  )}
                </span>

                {isEditing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)} disabled={isBusy}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => handleSave(group.current)} disabled={isBusy}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    {group.history.length > 0 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={isExpanded ? "Hide history" : "Show history"}
                        onClick={() => toggleExpanded(key)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Edit ${group.canonicalIngredient} preference`}
                      onClick={() => startEdit(group.current)}
                      disabled={isBusy}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Forget ${group.canonicalIngredient} preference`}
                      onClick={() => handleDelete(group.current)}
                      disabled={isBusy}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {isExpanded && group.history.length > 0 && (
                <ul className="mt-2 ml-1 space-y-1 border-l border-border pl-3">
                  {group.history.map((row) => (
                    <li key={row.id} className="text-xs text-muted-foreground">
                      {row.product_name} — since {formatSinceDate(row.valid_from)}
                      {row.source === "correction" ? " (correction)" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            🤷 No beliefs yet — teach one in chat: "vi har bytt till..."
          </p>
        )}
      </div>
    </Card>
  );
}
