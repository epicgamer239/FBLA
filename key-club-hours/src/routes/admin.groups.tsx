import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, addDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/groups")({
  head: () => ({ meta: [{ title: "Groups — Admin" }] }),
  component: GroupsPage,
});

type GroupRow = { groupId: string; leaderName: string; memberCount: number; totalHours: number };

function GroupsPage() {
  const { user, loading, isReviewer } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/auth" });
    else if (!isReviewer) { toast.error("Reviewers only."); nav({ to: "/" }); }
  }, [loading, user, isReviewer, nav]);

  async function load() {
    try {
      const [groupsSnapshot, usersSnapshot, submissionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "groups"), orderBy("leaderName"))),
        getDocs(query(collection(db, "users"))),
        getDocs(query(collection(db, "submissions"), where("status", "==", "approved"))),
      ]);

      const groups = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const users = usersSnapshot.docs.map(doc => doc.data());
      const submissions = submissionsSnapshot.docs.map(doc => doc.data());

      const groupMap = new Map<string, GroupRow>();
      groups.forEach((g: any) => {
        groupMap.set(g.id, { groupId: g.id, leaderName: g.leaderName, memberCount: 0, totalHours: 0 });
      });

      users.forEach((u: any) => {
        if (u.smallGroupId && groupMap.has(u.smallGroupId)) {
          const group = groupMap.get(u.smallGroupId)!;
          group.memberCount++;
        }
      });

      submissions.forEach((s: any) => {
        if (s.smallGroupId && groupMap.has(s.smallGroupId)) {
          const group = groupMap.get(s.smallGroupId)!;
          group.totalHours += Number(s.hoursCompleted) || 0;
        }
      });

      setRows(Array.from(groupMap.values()));
    } catch (error) {
      console.error("Error loading groups:", error);
      toast.error("Failed to load groups");
    }
  }
  useEffect(() => { if (isReviewer) load(); }, [isReviewer]);

  async function create() {
    const name = newName.trim();
    if (name.length < 2) return toast.error("Leader name is too short.");
    try {
      await addDoc(collection(db, "groups"), { leaderName: name, createdAt: new Date() });
      setNewName("");
      toast.success("Group created.");
      load();
    } catch (error: any) {
      toast.error(error.message || "Failed to create group");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (name.length < 2) return toast.error("Leader name is too short.");
    try {
      await updateDoc(doc(db, "groups", editing.id), { leaderName: name, updatedAt: new Date() });
      // Cascade: update denormalized leader name on users + submissions
      const usersSnapshot = await getDocs(query(collection(db, "users"), where("smallGroupId", "==", editing.id)));
      const usersToUpdate = usersSnapshot.docs.map(doc => doc.id);
      for (const userId of usersToUpdate) {
        await updateDoc(doc(db, "users", userId), { smallGroupLeaderName: name, updatedAt: new Date() });
      }
      const submissionsSnapshot = await getDocs(query(collection(db, "submissions"), where("smallGroupId", "==", editing.id)));
      const submissionsToUpdate = submissionsSnapshot.docs.map(doc => doc.id);
      for (const subId of submissionsToUpdate) {
        await updateDoc(doc(db, "submissions", subId), { smallGroupLeaderName: name, updatedAt: new Date() });
      }
      setEditing(null);
      toast.success("Group updated.");
      load();
    } catch (error: any) {
      toast.error(error.message || "Failed to update group");
    }
  }

  async function del(g: GroupRow) {
    if (g.memberCount > 0) return toast.error(`Reassign all ${g.memberCount} members first.`);
    if (!confirm(`Delete group "${g.leaderName}"?`)) return;
    try {
      await deleteDoc(doc(db, "groups", g.groupId));
      toast.success("Group deleted.");
      load();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete group");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold">Groups</h1>

        <Card>
          <CardContent className="py-4 flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs uppercase text-muted-foreground">New group — leader name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ms. Jones" />
            </div>
            <Button onClick={create}>Create group</Button>
          </CardContent>
        </Card>

        {rows.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No groups yet.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {rows.map((g) => (
              <Card key={g.groupId}>
                <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  {editing?.id === g.groupId ? (
                    <div className="flex gap-2 items-center flex-1">
                      <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      <Button size="sm" onClick={saveEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="font-semibold">{g.leaderName}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.memberCount} member{g.memberCount === 1 ? "" : "s"} · {round(g.totalHours)} hrs
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing({ id: g.groupId, name: g.leaderName })}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => del(g)} disabled={g.memberCount > 0}>Delete</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function round(n: number) { return Math.round(Number(n) * 10) / 10; }
