"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { HOUR_TYPES, hourTypeLabel, type HourType } from "@/lib/brand";
import {
  validateActivityDescription,
  validateHours,
  validatePointOfContact,
  validateProofFile,
} from "@/lib/validation";

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
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  // Form state — plain useState so validation cannot misfire on valid input.
  const [activity, setActivity] = useState("");
  const [poc, setPoc] = useState("");
  const [hours, setHours] = useState("");
  const [hourType, setHourType] = useState<HourType>("In Club");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [loading, user, router]);

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

    // Syntactic + semantic validation via shared helpers (FBLA rating: input validation).
    const descErr = validateActivityDescription(activity);
    if (descErr) return toast.error(descErr);
    const pocErr = validatePointOfContact(poc);
    if (pocErr) return toast.error(pocErr);
    const hoursErr = validateHours(hours);
    if (hoursErr) return toast.error(hoursErr);
    const proofErr = validateProofFile(file);
    if (proofErr) return toast.error(proofErr);

    const desc = activity.trim();
    const contact = poc.trim();
    const hoursNum = Number(hours);

    setBusy(true);
    try {
      // Prepare image (compress and convert to data URL)
      const imageData = await prepareProofImage(file!);

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

      toast.success("Hours submitted! A coordinator will review your submission.");
      router.push("/dashboard");
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
              <CardTitle>Team assignment required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                You must be assigned to a team before you can submit volunteer hours. This keeps records tied to the correct team totals for organization leaders.
              </p>
              <p className="text-sm text-muted-foreground">
                Please contact a coordinator to be assigned to a team. Once assigned, you can submit hours here.
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
                  <ReadOnly label="Team leader" value={profile?.smallGroupLeaderName || "—"} />
                  <ReadOnly label="Grade / cohort" value={profile?.grade ?? ""} />
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
                      onChange={(e) => setHourType(e.target.value as HourType)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm h-9">
                      {HOUR_TYPES.map((t) => (
                        <option key={t} value={t}>{hourTypeLabel(t)}</option>
                      ))}
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
                  <Link href="/dashboard"><Button type="button" variant="outline">Cancel</Button></Link>
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

export default SubmitPage;
