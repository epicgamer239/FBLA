import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, db, storage } from "@/lib/firebase";
import { ref, deleteObject } from "firebase/storage";
import { doc, getDoc, addDoc, collection, serverTimestamp, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { prepareProofImage } from "@/lib/proofImage";

export const Route = createFileRoute("/submit")({
  head: () => ({ meta: [{ title: "Submit Hours" }] }),
  component: SubmitPage,
});

type Profile = {
  firstName: string;
  lastName: string;
  grade: "Freshman" | "Sophomore" | "Junior" | "Senior";
  smallGroupLeaderName: string;
  smallGroupId: string | null;
  email: string;
};

function SubmitPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  // Form state — plain useState so validation cannot misfire on valid input.
  const [activity, setActivity] = useState("");
  const [poc, setPoc] = useState("");
  const [hours, setHours] = useState("");
  const [hourType, setHourType] = useState<"In Club" | "Out of Club" | "Summer Hours">("In Club");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();
        setProfile(userData as Profile | null);
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    })();
  }, [user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;

    // Manual validation — no HTML5 `required` to avoid false "required" errors.
    const desc = activity.trim();
    const contact = poc.trim();
    const hoursNum = parseFloat(hours);

    if (desc.length < 10) return toast.error("Description must be at least 10 characters.");
    if (desc.length > 1000) return toast.error("Description must be 1000 characters or fewer.");
    if (contact.length < 5) return toast.error("Point of contact must be at least 5 characters.");
    if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      return toast.error("Hours must be greater than 0 and at most 24.");
    }
    if (!file) return toast.error("Please attach a proof image.");
    if (!file.type.startsWith("image/")) return toast.error("Proof must be an image file.");
    if (file.size > 10 * 1024 * 1024) return toast.error("Image is too large (max 10 MB).");

    setBusy(true);
    try {
      // Prepare image (compress and convert to data URL)
      const imageData = await prepareProofImage(file);

      // Create batch write for submission and proof
      const batch = writeBatch(db);
      const submissionRef = doc(collection(db, "submissions"));
      const proofRef = doc(collection(db, "submissionProofs"), submissionRef.id);

      // Write submission document
      batch.set(submissionRef, {
        userId: user.uid,
        userName: `${profile.firstName} ${profile.lastName}`,
        userEmail: profile.email,
        grade: profile.grade,
        smallGroupId: profile.smallGroupId,
        smallGroupLeaderName: profile.smallGroupLeaderName,
        activityDescription: desc,
        pointOfContact: contact,
        hoursCompleted: hoursNum,
        hourType: hourType,
        proofInFirestore: true,
        imageProofUrl: "",
        imageProofStoragePath: "",
        status: "pending",
        hoursCredited: 0,
        reviewedByUid: null,
        reviewedAt: null,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Write proof document
      batch.set(proofRef, {
        userId: user.uid,
        uploadedByUid: user.uid,
        imageData: imageData,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      toast.success("Hours submitted! A board member will review your submission.");
      nav({ to: "/dashboard" });
    } catch (err: any) {
      console.error("Submission error:", err);
      console.error("Error code:", err?.code);
      console.error("Error message:", err?.message);
      toast.error(err.message ?? "Submission failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Submit Volunteer Hours</h1>

        {!profile?.smallGroupId ? (
          <Card>
            <CardHeader>
              <CardTitle>Group Assignment Required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                You must be assigned to a small group before you can submit volunteer hours. This ensures that your submissions are properly tracked and counted toward your group's totals.
              </p>
              <p className="text-sm text-muted-foreground">
                Please contact a board member to be assigned to a group. Once you have a group assignment, you'll be able to submit hours here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>New submission</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <ReadOnly label="Name" value={profile?.firstName && profile?.lastName ? `${profile.firstName} ${profile.lastName}` : (profile?.firstName || profile?.lastName || "")} />
                  <ReadOnly label="Group leader" value={profile?.smallGroupLeaderName || "—"} />
                  <ReadOnly label="Grade" value={profile?.grade ?? ""} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="activity">Description of volunteer activity</Label>
                  <Textarea id="activity" rows={4} value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                    placeholder="What did you do? Where? Who organized it?" />
                  <p className="text-xs text-muted-foreground">{activity.trim().length} / 1000 (min 10)</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="poc">Point of contact</Label>
                  <Textarea id="poc" rows={2} value={poc}
                    onChange={(e) => setPoc(e.target.value)}
                    placeholder="e.g. Jane Smith, Director, 703-555-0100 or jsmith@example.org" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="hours">Number of hours</Label>
                    <Input id="hours" type="number" step="0.5" min="0.5" max="24"
                      value={hours} onChange={(e) => setHours(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="type">Type of hours</Label>
                    <select id="type" value={hourType}
                      onChange={(e) => setHourType(e.target.value as any)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm h-9">
                      <option>In Club</option>
                      <option>Out of Club</option>
                      <option>Summer Hours</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="proof">Picture proof (image, max 10 MB)</Label>
                  <Input id="proof" type="file" accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <p className="text-xs text-muted-foreground">Photos are automatically compressed. Large photos may take a moment to process.</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={busy}>
                    {busy ? "Submitting…" : "Submit hours"}
                  </Button>
                  <Link to="/dashboard"><Button type="button" variant="outline">Cancel</Button></Link>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value || "—"}</div>
    </div>
  );
}
