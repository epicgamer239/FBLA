"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { db } from "@/lib/firebase";
import { collection, getDocs, getDoc, query, where, orderBy, doc, updateDoc, deleteDoc, addDoc, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { friendlyError } from "@/lib/errors";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";

type Row = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  grade: string;
  phone: string | null;
  requestedRole: AppRole | null;
  smallGroupId: string | null;
  smallGroupLeaderName: string;
  createdAt: any;
  role: AppRole | null;
  inClub: number;
  outOfClub: number;
  summer: number;
  total: number;
  parentRequestedStudentName?: string;
  parentChildUids?: string[];
};
type Group = { id: string; leaderName: string };

const ALL_ROLES: AppRole[] = ["member", "parent", "board", "sponsor"];

function MembersPage() {
  const { user, loading, isReviewer, isSponsor } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState("");
  const [loadingRows, setLoadingRows] = useState(true);
  const [allowTeamChanges, setAllowTeamChanges] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [unassigningAll, setUnassigningAll] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/auth");
    else if (!isReviewer) { toast.error("Reviewers only."); router.push("/"); }
  }, [loading, user, isReviewer, router]);

  async function load() {
    setLoadingRows(true);
    try {
      const [usersSnapshot, submissionsSnapshot, groupsSnapshot, settingsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "submissions"), where("status", "==", "approved"))),
        getDocs(query(collection(db, "groups"), orderBy("leaderName"))),
        getDoc(doc(db, "settings", "config")),
      ]);

      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const submissions = submissionsSnapshot.docs.map(doc => doc.data());
      const groupsData = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Group[];
      const settingsData = settingsSnapshot.data();
      setAllowTeamChanges(settingsData?.allowTeamChanges ?? true);

      const byUser: Record<string, { in_club: number; out_of_club: number; summer: number }> = {};
      for (const s of submissions as any[]) {
        const u = (byUser[s.userId] ||= { in_club: 0, out_of_club: 0, summer: 0 });
        const h = Number(s.hoursCompleted) || 0;
        if (s.hourType === "In Club") u.in_club += h;
        else if (s.hourType === "Out of Club") u.out_of_club += h;
        else u.summer += h;
      }

      const out: Row[] = users.map((p: any) => {
        // Sponsors don't have hours
        if (p.role === 'sponsor') {
          return {
            id: p.id,
            email: p.email,
            firstName: p.firstName || "",
            lastName: p.lastName || "",
            grade: p.grade,
            phone: p.phone,
            requestedRole: p.requestedRole,
            smallGroupId: p.smallGroupId,
            smallGroupLeaderName: p.smallGroupLeaderName,
            createdAt: p.createdAt,
            role: p.role,
            inClub: 0,
            outOfClub: 0,
            summer: 0,
            total: 0,
            parentRequestedStudentName: p.parentRequestedStudentName,
            parentChildUids: p.parentChildUids,
          };
        }

        const h = byUser[p.id] ?? { in_club: 0, out_of_club: 0, summer: 0 };
        return {
          id: p.id,
          email: p.email,
          firstName: p.firstName || "",
          lastName: p.lastName || "",
          grade: p.grade,
          phone: p.phone,
          requestedRole: p.requestedRole,
          smallGroupId: p.smallGroupId,
          smallGroupLeaderName: p.smallGroupLeaderName,
          createdAt: p.createdAt,
          role: p.role,
          inClub: h.in_club,
          outOfClub: h.out_of_club,
          summer: h.summer,
          total: h.in_club + h.out_of_club + h.summer,
          parentRequestedStudentName: p.parentRequestedStudentName,
          parentChildUids: p.parentChildUids,
        };
      });
      // Sort: non-sponsors by total hours (descending), sponsors at the end
      out.sort((a, b) => {
        if (a.role === 'sponsor' && b.role !== 'sponsor') return 1;
        if (a.role !== 'sponsor' && b.role === 'sponsor') return -1;
        if (a.role === 'sponsor' && b.role === 'sponsor') return 0;
        return b.total - a.total;
      });
      setRows(out);
      setGroups(groupsData);
      setLoadingRows(false);
    } catch (error) {
      console.error("Error loading members:", error);
      toast.error(friendlyError(error));
      setLoadingRows(false);
    }
  }
  useEffect(() => { if (isReviewer) load(); }, [isReviewer]);

  async function setRole(userId: string, role: AppRole, currentRole: AppRole | null) {
    if (role === "sponsor" && !isSponsor) return toast.error("Only sponsors can grant the sponsor role.");
    if (currentRole === "sponsor" && !isSponsor && role !== "sponsor") {
      return toast.error("Only sponsors can change a sponsor's role.");
    }
    try {
      const updateData: any = { role, updatedAt: new Date() };

      // If changing to board role and they don't already have a group, create one
      if (role === "board" && currentRole !== "board") {
        const userDoc = await getDoc(doc(db, "users", userId));
        const userData = userDoc.data();
        const fullName = userData?.firstName && userData?.lastName ? `${userData.firstName} ${userData.lastName}` : (userData?.displayName || userData?.email);
        const groupRef = await addDoc(collection(db, "groups"), {
          leaderName: fullName,
          createdAt: new Date(),
        });
        updateData.smallGroupId = groupRef.id;
        updateData.smallGroupLeaderName = fullName;
      }

      // If changing to parent role, clear grade, group, and hour tracking fields
      if (role === "parent" && currentRole !== "parent") {
        updateData.grade = null;
        updateData.smallGroupId = null;
        updateData.smallGroupLeaderName = null;
        updateData.inClubHours = 0;
        updateData.outOfClubHours = 0;
        updateData.summerHoursRaw = 0;
        updateData.effectiveTotalHours = 0;
        updateData.phone = null;
      }

      // If changing to sponsor role, clear group assignment and hour tracking fields
      if (role === "sponsor" && currentRole !== "sponsor") {
        updateData.smallGroupId = null;
        updateData.smallGroupLeaderName = null;
        updateData.inClubHours = 0;
        updateData.outOfClubHours = 0;
        updateData.summerHoursRaw = 0;
        updateData.effectiveTotalHours = 0;
        updateData.grade = null;
      }

      await updateDoc(doc(db, "users", userId), updateData);
      toast.success(`Role set to ${role}.`);
      load();
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  async function setGroup(userId: string, groupId: string) {
    const user = rows.find(r => r.id === userId);
    if (user?.role === "sponsor") {
      return toast.error("Sponsors cannot be assigned to groups.");
    }

    const groupLeader = groups.find((g) => g.id === groupId)?.leaderName ?? "";
    try {
      await updateDoc(doc(db, "users", userId), {
        smallGroupId: groupId || null,
        smallGroupLeaderName: groupLeader,
        updatedAt: new Date(),
      });
      toast.success("Group updated.");
      load();
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  async function reviewRequest(userId: string, approve: boolean) {
    try {
      console.log("Review request - userId:", userId, "approve:", approve);
      const userDoc = await getDoc(doc(db, "users", userId));
      console.log("User doc exists:", userDoc.exists());
      const userData = userDoc.data();
      console.log("User data:", userData);
      if (approve) {
        console.log("Approving role to:", userData?.requestedRole);
        const newRole = userData?.requestedRole;
        let groupId = userData?.smallGroupId;
        let leaderName = userData?.smallGroupLeaderName;

        // If approving to board role, create a new group for them
        if (newRole === "board") {
          const fullName = userData?.firstName && userData?.lastName ? `${userData.firstName} ${userData.lastName}` : (userData?.displayName || userData?.email);
          const groupRef = await addDoc(collection(db, "groups"), {
            leaderName: fullName,
            createdAt: new Date(),
          });
          groupId = groupRef.id;
          leaderName = fullName;
        }

        // For member/parent role changes, don't change group assignment
        const updateData: any = {
          role: newRole,
          requestedRole: null,
          updatedAt: new Date(),
        };

        // Only update group fields for board role
        if (newRole === "board") {
          updateData.smallGroupId = groupId;
          updateData.smallGroupLeaderName = leaderName;
        }

        // If approving to sponsor role, clear group assignment and hour tracking fields
        if (newRole === "sponsor") {
          updateData.smallGroupId = null;
          updateData.smallGroupLeaderName = null;
          updateData.inClubHours = 0;
          updateData.outOfClubHours = 0;
          updateData.summerHoursRaw = 0;
          updateData.effectiveTotalHours = 0;
          updateData.grade = null;
        }

        await updateDoc(doc(db, "users", userId), updateData);
      } else {
        console.log("Declining role request");
        await updateDoc(doc(db, "users", userId), {
          requestedRole: null,
          updatedAt: new Date(),
        });
      }
      toast.success(approve ? "Role request approved." : "Role request declined.");
      load();
    } catch (error: any) {
      console.error("Review request error:", error);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
      toast.error(friendlyError(error));
    }
  }

  function exportCsv() {
    const headers = ["Name", "Email", "Grade", "Group", "Role", "In Club", "Out of Club", "Summer", "Total", "Joined"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const fullName = r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : r.firstName || r.lastName || "";
      lines.push([
        csv(fullName), csv(r.email), r.grade, csv(r.smallGroupLeaderName || "Unassigned"),
        r.role || "member",
        round(r.inClub), round(r.outOfClub), round(r.summer), round(r.total),
        new Date(r.createdAt?.toDate?.() || r.createdAt).toISOString().slice(0, 10),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `key-club-members-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filtered = rows.filter((r) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    const fullName = r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : r.firstName || r.lastName || "";
    return fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
      || r.smallGroupLeaderName.toLowerCase().includes(q);
  });

  // Sorting logic
  const sorted = [...filtered].sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;
    
    let comparison = 0;
    
    switch (sortColumn) {
      case "name":
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
        comparison = nameA.localeCompare(nameB);
        break;
      case "grade":
        const gradeOrder: Record<string, number> = { "Freshman": 0, "Sophomore": 1, "Junior": 2, "Senior": 3 };
        const gradeA = gradeOrder[a.grade] ?? 99;
        const gradeB = gradeOrder[b.grade] ?? 99;
        comparison = gradeA - gradeB;
        break;
      case "group":
        // Handle empty group names - put them at the end
        const groupA = a.smallGroupLeaderName || "zzzzzzzzzz"; // Empty groups sort last
        const groupB = b.smallGroupLeaderName || "zzzzzzzzzz";
        comparison = groupA.localeCompare(groupB);
        break;
      case "role":
        const roleOrder: Record<string, number> = { "board": 0, "member": 1, "parent": 2, "sponsor": 3 };
        const roleA = roleOrder[a.role || "member"] ?? 99;
        const roleB = roleOrder[b.role || "member"] ?? 99;
        comparison = roleA - roleB;
        break;
      case "inClub":
        comparison = a.inClub - b.inClub;
        break;
      case "outOfClub":
        comparison = a.outOfClub - b.outOfClub;
        break;
      case "summer":
        comparison = a.summer - b.summer;
        break;
      case "total":
        comparison = a.total - b.total;
        break;
      default:
        return 0;
    }
    
    return sortDirection === "asc" ? comparison : -comparison;
  });

  function handleSort(column: string) {
    if (sortColumn === column) {
      // Same column: cycle through asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      // New column: start with asc
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function getSortIcon(column: string) {
    if (sortColumn !== column) return <Minus size={14} className="text-muted-foreground" />;
    if (sortDirection === "asc") return <ChevronUp size={14} className="text-foreground" />;
    if (sortDirection === "desc") return <ChevronDown size={14} className="text-foreground" />;
    return <Minus size={14} className="text-muted-foreground" />;
  }

  async function assignGroups() {
    if (groups.length === 0) return toast.error("No groups available to assign.");

    const unassignedUsers = rows.filter((r) => (!r.smallGroupId || r.smallGroupId === "") && r.role !== "sponsor");
    if (unassignedUsers.length === 0) return toast.info("No unassigned users to assign.");

    setAssigning(true);
    try {
      // Count current members in each group
      const groupMemberCounts: Record<string, number> = {};
      groups.forEach(g => groupMemberCounts[g.id] = 0);
      rows.forEach(r => {
        if (r.smallGroupId && groupMemberCounts[r.smallGroupId] !== undefined) {
          groupMemberCounts[r.smallGroupId]++;
        }
      });

      // Sort groups by member count (ascending)
      const sortedGroups = [...groups].sort((a, b) => groupMemberCounts[a.id] - groupMemberCounts[b.id]);

      // Assign users to groups with even distribution
      const batch = writeBatch(db);
      unassignedUsers.forEach((user, index) => {
        const groupIndex = index % sortedGroups.length;
        const group = sortedGroups[groupIndex];
        batch.update(doc(db, "users", user.id), {
          smallGroupId: group.id,
          smallGroupLeaderName: group.leaderName,
          updatedAt: new Date(),
        });
      });

      await batch.commit();
      toast.success(`Assigned ${unassignedUsers.length} users to groups.`);
      load();
    } catch (error) {
      console.error("Error assigning groups:", error);
      toast.error(friendlyError(error));
    } finally {
      setAssigning(false);
    }
  }

  async function unassignAllGroups() {
    setShowUnassignDialog(true);
  }

  async function confirmUnassignAll() {
    setShowUnassignDialog(false);
    setUnassigningAll(true);
    try {
      const batch = writeBatch(db);
      let unassignedCount = 0;
      let skippedCount = 0;

      rows.forEach((user) => {
        // Skip sponsors and users without a group
        if (user.role === "sponsor" || !user.smallGroupId) return;

        // Skip coordinators who are leaders of a group with their name
        if (user.role === "board") {
          const group = groups.find(g => g.id === user.smallGroupId);
          const fullName = `${user.firstName} ${user.lastName}`;
          if (group && group.leaderName === fullName) {
            skippedCount++;
            return;
          }
        }

        // Unassign the user
        batch.update(doc(db, "users", user.id), {
          smallGroupId: null,
          smallGroupLeaderName: null,
          updatedAt: new Date(),
        });
        unassignedCount++;
      });

      if (unassignedCount === 0) {
        toast.info("No users to unassign.");
        return;
      }

      await batch.commit();
      toast.success(`Unassigned ${unassignedCount} users from groups (${skippedCount} board leaders skipped).`);
      load();
    } catch (error) {
      console.error("Error unassigning groups:", error);
      toast.error(friendlyError(error));
    } finally {
      setUnassigningAll(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Members</h1>
          <div className="flex gap-2">
            <Input placeholder="Search name, email, group…" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64" />
            {allowTeamChanges && <Button variant="outline" onClick={assignGroups} disabled={assigning}>{assigning ? "Assigning…" : "Assign Groups"}</Button>}
            {allowTeamChanges && <Button variant="outline" onClick={unassignAllGroups} disabled={unassigningAll}>{unassigningAll ? "Unassigning…" : "Unassign All"}</Button>}
            <Button variant="outline" onClick={load}>Refresh</Button>
            <Button onClick={exportCsv}>Export CSV</Button>
          </div>
        </div>

        {(() => {
          const pending = rows.filter((r) => r.requestedRole);
          if (pending.length === 0) return null;
          return (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="font-semibold">Pending role requests ({pending.length})</h2>
                <div className="space-y-2">
                  {pending.map((r) => {
                    const canApprove = r.requestedRole === "sponsor" ? isSponsor : isReviewer;
                    return (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                        <div className="text-sm">
                          <div className="font-medium">{r.firstName} {r.lastName} <span className="text-muted-foreground">({r.email})</span></div>
                          <div className="text-xs text-muted-foreground">Requesting: <span className="font-medium">{r.requestedRole}</span>{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={!canApprove} onClick={() => reviewRequest(r.id, true)}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => reviewRequest(r.id, false)}>Decline</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {loadingRows ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 cursor-pointer hover:bg-muted/80" onClick={() => handleSort("name")}>
                      <div className="flex items-center gap-1">Name {getSortIcon("name")}</div>
                    </th>
                    <th className="px-3 py-2 cursor-pointer hover:bg-muted/80" onClick={() => handleSort("grade")}>
                      <div className="flex items-center gap-1">Grade {getSortIcon("grade")}</div>
                    </th>
                    <th className="px-3 py-2 cursor-pointer hover:bg-muted/80" onClick={() => handleSort("group")}>
                      <div className="flex items-center gap-1">Group {getSortIcon("group")}</div>
                    </th>
                    <th className="px-3 py-2 cursor-pointer hover:bg-muted/80" onClick={() => handleSort("role")}>
                      <div className="flex items-center gap-1">Role {getSortIcon("role")}</div>
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort("inClub")}>
                      <div className="flex items-center justify-end gap-1">In Club {getSortIcon("inClub")}</div>
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort("outOfClub")}>
                      <div className="flex items-center justify-end gap-1">OOC {getSortIcon("outOfClub")}</div>
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort("summer")}>
                      <div className="flex items-center justify-end gap-1">Summer {getSortIcon("summer")}</div>
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:bg-muted/80" onClick={() => handleSort("total")}>
                      <div className="flex items-center justify-end gap-1">Total {getSortIcon("total")}</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.map((r) => {
                    const role: AppRole = (r.role ?? "member");
                    const isParent = role === "parent";
                    const isSponsor = role === "sponsor";
                    return (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.firstName} {r.lastName}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                          {r.phone && <div className="text-xs text-muted-foreground">{formatPhone(r.phone)}</div>}
                        </td>
                        {isParent ? (
                          <>
                            <td className="px-3 py-2">
                              {r.parentRequestedStudentName ? (
                                <span className="text-xs">{r.parentRequestedStudentName}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">{r.parentChildUids?.length || 0} child(ren) linked</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                          </>
                        ) : isSponsor ? (
                          <>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{r.grade}</td>
                            <td className="px-3 py-2">
                              <select value={r.smallGroupId ?? ""} onChange={(e) => setGroup(r.id, e.target.value)}
                                className="rounded border bg-background px-2 py-1 text-xs">
                                <option value="">Unassigned</option>
                                {groups.map((g) => <option key={g.id} value={g.id}>{g.leaderName}</option>)}
                              </select>
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <select value={role} onChange={(e) => setRole(r.id, e.target.value as AppRole, r.role)}
                            className="rounded border bg-background px-2 py-1 text-xs">
                            {ALL_ROLES.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </td>
                        {isParent || isSponsor ? (
                          <>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">{round(r.inClub)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{round(r.outOfClub)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{round(r.summer)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{round(r.total)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No members match.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unassign All Groups</AlertDialogTitle>
              <AlertDialogDescription>
                This will unassign all members from their groups. Coordinators who are leaders of a group with their name will NOT be unassigned. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmUnassignAll}>Unassign All</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

function round(n: number) { return Math.round(Number(n) * 10) / 10; }
function csv(s: string) { return `"${(s ?? "").replace(/"/g, '""')}"`; }
function formatPhone(phone: string | null) {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length !== 10) return phone;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}

export default MembersPage;
