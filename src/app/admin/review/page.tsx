"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ProofImage } from "@/components/common/ProofImage";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, doc, updateDoc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { friendlyError } from "@/lib/errors";

type Sub = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  grade: string;
  smallGroupId: string;
  smallGroupLeaderName: string;
  activityDescription: string;
  pointOfContact: string;
  hoursCompleted: number;
  hourType: string;
  status: "pending" | "approved" | "declined";
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: any;
  submittedAt: any;
  proofInFirestore?: boolean;
  imageProofUrl?: string;
  imageProofStoragePath?: string;
};

function ReviewPage() {
  const { user, isReviewer, loading, displayName } = useAuth();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "declined" | "all">("pending");
  const [groupFilter, setGroupFilter] = useState<"all" | "my-group">("my-group");
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineText, setDeclineText] = useState("");
  const [myGroupId, setMyGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/auth");
    else if (!isReviewer) {
      toast.error("Only coordinators and sponsors can review.");
      router.push("/");
    }
  }, [loading, user, isReviewer, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        setMyGroupId(userData?.smallGroupId || null);
      } catch (error) {
        console.error("Error fetching user group:", error);
      }
    })();
  }, [user]);

  async function load() {
    try {
      let q = query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
      if (groupFilter === "my-group" && myGroupId) {
        q = query(q, where("smallGroupId", "==", myGroupId));
      }
      if (statusFilter !== "all") {
        q = query(q, where("status", "==", statusFilter));
      }
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Sub[];
      setSubs(data);
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }
  useEffect(() => { if (isReviewer) load(); /* eslint-disable-next-line */ }, [statusFilter, groupFilter, isReviewer, myGroupId]);

  async function approve(s: Sub) {
    try {
      await updateDoc(doc(db, "submissions", s.id), {
        status: "approved",
        reviewedByUid: user!.uid,
        reviewedByName: displayName,
        reviewedAt: new Date(),
        reviewNotes: null,
        hoursCredited: s.hoursCompleted,
        updatedAt: new Date(),
      });
      toast.success("Approved.");
      load();
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  async function decline() {
    if (!declineId) return;
    if (declineText.trim().length < 3)
      return toast.error("Please enter a reason (min 3 chars).");
    try {
      await updateDoc(doc(db, "submissions", declineId), {
        status: "declined",
        reviewedByUid: user!.uid,
        reviewedByName: displayName,
        reviewedAt: new Date(),
        reviewNotes: declineText.trim(),
        hoursCredited: 0,
        updatedAt: new Date(),
      });
      toast.success("Declined.");
      setDeclineId(null);
      setDeclineText("");
      load();
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">Review Submissions</h1>
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Group:</span>
            <div className="flex gap-2">
              <Button size="sm" variant={groupFilter === "my-group" ? "default" : "outline"}
                onClick={() => setGroupFilter("my-group")}>
                My Group
              </Button>
              <Button size="sm" variant={groupFilter === "all" ? "default" : "outline"}
                onClick={() => setGroupFilter("all")}>
                All Groups
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <div className="flex gap-2">
              {(["pending", "approved", "declined", "all"] as const).map((s) => (
                <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {!subs ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : subs.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {statusFilter === "all" ? "No submissions" : `No ${statusFilter} submissions`} {groupFilter === "my-group" ? "in your group" : ""}.
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {subs.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{s.userName} <span className="font-normal text-sm text-muted-foreground">· {s.grade} · {s.smallGroupLeaderName || "no group"}</span></p>
                      <p className="text-xs text-muted-foreground">{s.userEmail} · {new Date(s.submittedAt?.toDate?.() || s.submittedAt).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{s.hoursCompleted} hrs · {s.hourType}</p>
                    <p className="mt-2 whitespace-pre-wrap">{s.activityDescription}</p>
                    <p className="mt-2 text-muted-foreground"><strong>Contact:</strong> {s.pointOfContact}</p>
                  </div>
                  <div className="mt-2">
                    <ProofImage submission={s} autoLoad={s.status === "pending"} />
                  </div>
                  {s.status !== "pending" && s.reviewedByName && (
                    <div className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
                      Reviewed by {s.reviewedByName} on {s.reviewedAt && new Date(s.reviewedAt?.toDate?.() || s.reviewedAt).toLocaleString()}
                      {s.reviewNotes && <> — "{s.reviewNotes}"</>}
                    </div>
                  )}
                  {s.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approve(s)} className="bg-green-600 hover:bg-green-700">Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => { setDeclineId(s.id); setDeclineText(""); }}>Decline</Button>
                    </div>
                  )}

                  {declineId === s.id && (
                    <div className="space-y-2 border-t pt-3">
                      <Textarea placeholder="Reason for declining — the member will see this."
                        value={declineText} onChange={(e) => setDeclineText(e.target.value)} rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={decline}>Confirm decline</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeclineId(null)}>Cancel</Button>
                      </div>
                    </div>
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

function StatusBadge({ status }: { status: Sub["status"] }) {
  const map = {
    pending: "bg-yellow-100 text-yellow-900 border-yellow-300",
    approved: "bg-green-100 text-green-900 border-green-300",
    declined: "bg-red-100 text-red-900 border-red-300",
  } as const;
  return <Badge variant="outline" className={map[status]}>{status}</Badge>;
}

export default ReviewPage;
