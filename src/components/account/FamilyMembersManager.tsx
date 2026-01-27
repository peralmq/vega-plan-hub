import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyMembers } from "@/hooks/useFamilyMembers";
import { Users, Plus, Trash2, Edit2, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function FamilyMembersManager() {
  const { familyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember, loading, availableColors } = useFamilyMembers();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    
    setAdding(true);
    try {
      await addFamilyMember(newName);
      setNewName("");
      toast({ title: "Family member added! 👨‍👩‍👧" });
    } catch (error) {
      toast({ title: "Error adding family member", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    
    try {
      await updateFamilyMember(id, { name: editName.trim() });
      setEditingId(null);
      toast({ title: "Name updated!" });
    } catch (error) {
      toast({ title: "Error updating name", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFamilyMember(id);
      toast({ title: "Family member removed" });
    } catch (error) {
      toast({ title: "Error removing family member", variant: "destructive" });
    }
  };

  const handleColorChange = async (id: string, color: string) => {
    try {
      await updateFamilyMember(id, { avatar_color: color });
    } catch (error) {
      toast({ title: "Error updating color", variant: "destructive" });
    }
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
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
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Family Members</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Add family members to track individual recipe ratings.
      </p>

      {/* Add new member */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={!newName.trim() || adding}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Members list */}
      <div className="space-y-3">
        {familyMembers.map((member) => (
          <div key={member.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            {/* Color picker */}
            <div className="relative group">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold transition-transform hover:scale-110"
                style={{ backgroundColor: member.avatar_color }}
              >
                {member.name[0].toUpperCase()}
              </button>
              <div className="absolute left-0 top-full mt-2 hidden group-hover:flex gap-1 p-2 bg-background rounded-lg shadow-lg border z-10">
                {availableColors.map((color) => (
                  <button
                    key={color}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-125"
                    style={{ backgroundColor: color }}
                    onClick={() => handleColorChange(member.id, color)}
                  />
                ))}
              </div>
            </div>

            {editingId === member.id ? (
              <div className="flex-1 flex gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdate(member.id)}
                  className="h-8"
                />
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={() => handleUpdate(member.id)}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <span className="flex-1 font-medium">{member.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => startEdit(member.id, member.name)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(member.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        {familyMembers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No family members yet. Add one above!
          </p>
        )}
      </div>
    </Card>
  );
}
