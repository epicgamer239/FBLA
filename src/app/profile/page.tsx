"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signOut } from "firebase/auth";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";

type Group = { id: string; leaderName: string };

function ProfilePage() {
  const { user, loading, refresh, role } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState<"Freshman"|"Sophomore"|"Junior"|"Senior">("Freshman");
  const [groupId, setGroupId] = useState<string>("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<AppRole | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [duesPaid, setDuesPaid] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  // Helper function to format phone number as XXX-XXX-XXXX
  function formatPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  }

  useEffect(() => { if (!loading && !user) router.push("/auth"); }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();
        setUserData(userData);

        setFirstName(userData?.firstName || "");
        setLastName(userData?.lastName || "");
        setGrade((userData?.grade || "Freshman") as any);
        setGroupId(userData?.smallGroupId ?? "");
        setPhoneInput(userData?.phone || "");
        setRequestedRole(userData?.requestedRole || null);
        setDuesPaid(userData?.duesPaid || false);

        // Only load groups for board/sponsor users (they need to assign groups)
        if (role === "board" || role === "sponsor") {
          const groupsQuery = query(collection(db, "groups"), orderBy("leaderName"));
          const groupsSnapshot = await getDocs(groupsQuery);
          const groupsData = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Group[];
          setGroups(groupsData);
        }
      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
    })();
  }, [user, role]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (firstName.trim().length < 1 || lastName.trim().length < 1) return toast.error("First and last name are required.");

    // Validate phone number has exactly 10 digits
    const phoneDigits = phoneInput.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      toast.error("Phone number must have exactly 10 digits.");
      return;
    }

    setBusy(true);
    const groupLeader = groups.find((g) => g.id === groupId)?.leaderName ?? "";
    try {
      const updateData: any = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        grade,
        phone: phoneInput.replace(/\D/g, ''), // Store only the 10 digits
        updatedAt: new Date(),
      };

      // Only admins/sponsors can change group assignment
      if (role === "board" || role === "sponsor") {
        updateData.smallGroupId = groupId || null;
        updateData.smallGroupLeaderName = groupLeader;
      }

      // Never allow users to update duesPaid field through profile page
      // This field is only updated by admins through the tracking page

      await updateDoc(doc(db, "users", user.uid), updateData);
      toast.success("Profile saved.");
      refresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (!user) return;
    if (!currentPassword) return toast.error("Please enter your current password.");
    if (newPassword.length < 6) return toast.error("New password must be at least 6 characters.");
    if (newPassword !== confirmPassword) return toast.error("New passwords do not match.");
    
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully.");
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        toast.error("Current password is incorrect.");
      } else {
        toast.error(error.message || "Failed to update password");
      }
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Failed to sign out");
    }
  }

  async function requestBoardRole() {
    if (!user) return;
    if (requestedRole) return toast.error("You already have a pending role request.");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        requestedRole: "board",
        updatedAt: new Date(),
      });
      setRequestedRole("board");
      toast.success("Board role request submitted. A coordinator or sponsor will review your request.");
      refresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit request");
    }
  }

  async function requestRoleChange(newRole: "member" | "parent") {
    if (!user) return;
    if (requestedRole) return toast.error("You already have a pending role request.");
    if (role === newRole) return toast.error("You already have this role.");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        requestedRole: newRole,
        updatedAt: new Date(),
      });
      setRequestedRole(newRole);
      toast.success(`${newRole.charAt(0).toUpperCase() + newRole.slice(1)} role request submitted. A coordinator will review your request.`);
      refresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit request");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <Card>
          <CardHeader><CardTitle>Account details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4" noValidate>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="grp">Team leader</Label>
                {role === "board" || role === "sponsor" ? (
                  <select id="grp" value={groupId} onChange={(e) => setGroupId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm h-9">
                    <option value="">Unassigned</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.leaderName}</option>)}
                  </select>
                ) : (
                  <Input
                    value={groupId ? (userData?.smallGroupLeaderName || "Unassigned") : "Unassigned"}
                    disabled
                    className="bg-muted"
                  />
                )}
                {groups.length === 0 && (role === "board" || role === "sponsor") && (
                  <p className="text-xs text-muted-foreground">No groups exist yet — ask an admin to create one.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ph">Phone number</Label>
                <Input
                  id="ph"
                  value={formatPhoneNumber(phoneInput)}
                  onChange={(e) => {
                    // Only allow numbers, parentheses, and dashes
                    const value = e.target.value.replace(/[^0-9()\-]/g, '');
                    // Ensure no more than 10 digits
                    const digits = value.replace(/\D/g, '');
                    if (digits.length <= 10) {
                      setPhoneInput(value);
                    }
                  }}
                  placeholder="(555) 123-4567"
                />
                {phoneInput.replace(/\D/g, '').length > 0 && phoneInput.replace(/\D/g, '').length < 10 && (
                  <p className="text-xs text-muted-foreground">Phone number must have exactly 10 digits</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fn">First name</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ln">Last name</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="gr">Grade</Label>
                <select id="gr" value={grade} onChange={(e) => setGrade(e.target.value as any)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm h-9">
                  <option>Freshman</option><option>Sophomore</option><option>Junior</option><option>Senior</option>
                </select>
              </div>
              {(role === "member" || role === "parent") && (
                <div className="space-y-1">
                  <Label>Dues Paid</Label>
                  <Input value={duesPaid ? "Yes" : "No"} disabled className="bg-muted" />
                </div>
              )}
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cpw">Current password</Label>
              <Input id="cpw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="npw">New password (min 6)</Label>
              <Input id="npw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cpw2">Confirm new password</Label>
              <Input id="cpw2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <Button onClick={changePassword} variant="outline">Update password</Button>
          </CardContent>
        </Card>

        {(role === "member" || role === "parent") && (
          <Card>
            <CardHeader><CardTitle>Role Requests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {requestedRole ? (
                <p className="text-sm text-muted-foreground">
                  You have a pending request to become a <span className="font-medium">{requestedRole}</span>. A coordinator will review your request.
                </p>
              ) : (
                <div className="space-y-2">
                  <Button onClick={requestBoardRole} className="w-full" variant="outline">
                    Request Coordinator Role
                  </Button>
                  {role === "member" && (
                    <Button onClick={() => requestRoleChange("parent")} className="w-full" variant="outline">
                      Request Parent Role
                    </Button>
                  )}
                  {role === "parent" && (
                    <Button onClick={() => requestRoleChange("member")} className="w-full" variant="outline">
                      Request Member Role
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <Button onClick={handleSignOut} variant="destructive" className="w-full">Sign out</Button>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}

export default ProfilePage;
