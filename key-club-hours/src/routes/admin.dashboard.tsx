import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Admin — Key Club Hours" }] }),
  component: AdminDash,
});

function AdminDash() {
  const { user, loading, isReviewer } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/auth" });
    else if (!isReviewer) { toast.error("Reviewers only."); nav({ to: "/" }); }
  }, [loading, user, isReviewer, nav]);

  useEffect(() => {
    if (!isReviewer) return;
    (async () => {
      try {
        const [submissionsSnapshot, usersSnapshot] = await Promise.all([
          getDocs(query(collection(db, "submissions"))),
          getDocs(query(collection(db, "users"))),
        ]);

        const submissions = submissionsSnapshot.docs.map(doc => doc.data());
        const users = usersSnapshot.docs.map(doc => doc.data());

        const approvedSubmissions = submissions.filter((s: any) => s.status === "approved");
        const total_hours = approvedSubmissions.reduce((sum: number, s: any) => sum + (Number(s.hoursCompleted) || 0), 0);
        const pending_submissions = submissions.filter((s: any) => s.status === "pending").length;
        const approved_submissions = approvedSubmissions.length;

        setStats({
          total_hours,
          total_members: users.length,
          pending_submissions,
          approved_submissions,
        });
      } catch (error) {
        console.error("Error loading admin stats:", error);
      }
    })();
  }, [isReviewer]);

  if (!isReviewer) return null;
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold">Admin dashboard</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total hours" value={stats ? round(stats.total_hours) : "—"} />
          <Stat label="Members" value={stats?.total_members ?? "—"} />
          <Stat label="Pending" value={stats?.pending_submissions ?? "—"} highlight />
          <Stat label="Approved" value={stats?.approved_submissions ?? "—"} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AdminTile to="/admin/review" title="Review submissions" desc="Approve or decline pending hours." />
          <AdminTile to="/admin/members" title="Members" desc="View hour totals, change roles, reassign groups." />
          <AdminTile to="/admin/groups" title="Groups" desc="Create and manage small groups." />
          <AdminTile to="/admin/settings" title="Settings" desc="Club name, goals, and the summer hours cap." />
          <AdminTile to="/admin/tracking" title="Tracking" desc="Meeting attendance tracking and dates." />
          <AdminTile to="/admin/announcements" title="Announcements" desc="Automated emails and custom announcements." />
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <Card><CardContent className={`py-5 text-center ${highlight ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
    </CardContent></Card>
  );
}
function AdminTile({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to}>
      <Card className="hover:bg-muted/50 transition cursor-pointer h-full">
        <CardContent className="py-8">
          <p className="text-xl font-semibold">{title}</p>
          <p className="text-base text-muted-foreground mt-2">{desc}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
function round(n: number) { return Math.round(Number(n) * 10) / 10; }
