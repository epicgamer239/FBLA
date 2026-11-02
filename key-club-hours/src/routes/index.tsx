import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Key Club Hour Tracker" },
      { name: "description", content: "Log, track, and approve Key Club volunteer hours." },
    ],
  }),
  component: Index,
});

type Stats = {
  total_hours: number;
  in_club_hours: number;
  out_of_club_hours: number;
  summer_hours: number;
  total_members: number;
  pending_submissions: number;
  approved_submissions: number;
};
type Group = { groupId: string; leaderName: string; memberCount: number; totalHours: number };
type Settings = { clubName: string; academicYear: string; summerHoursCap: number; outOfClubHoursCap: number; instagramHandle: string; };

function Index() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [settingsDoc, submissionsSnapshot, usersSnapshot, groupsSnapshot] = await Promise.all([
          getDoc(doc(db, "settings", "config")),
          getDocs(query(collection(db, "submissions"))),
          getDocs(query(collection(db, "users"))),
          getDocs(query(collection(db, "groups"), orderBy("leaderName"))),
        ]);

        const settingsData = settingsDoc.data();
        setSettings(settingsData as Settings | null);

        const submissions = submissionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const groups = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Calculate stats
        const approvedSubmissions = submissions.filter((s: any) => s.status === "approved");
        const in_club_hours = approvedSubmissions.filter((s: any) => s.hourType === "In Club").reduce((sum: number, s: any) => sum + (Number(s.hoursCompleted) || 0), 0);
        const out_of_club_hours_raw = approvedSubmissions.filter((s: any) => s.hourType === "Out of Club").reduce((sum: number, s: any) => sum + (Number(s.hoursCompleted) || 0), 0);
        const summer_hours_raw = approvedSubmissions.filter((s: any) => s.hourType === "Summer Hours").reduce((sum: number, s: any) => sum + (Number(s.hoursCompleted) || 0), 0);

        // Apply caps
        const summerHoursCap = settingsData?.summerHoursCap || 10;
        const outOfClubHoursCap = settingsData?.outOfClubHoursCap || 15;
        const summer_hours_capped = Math.min(summer_hours_raw, summerHoursCap);
        const out_of_club_hours_capped = Math.min(out_of_club_hours_raw, outOfClubHoursCap);

        const total_hours = in_club_hours + out_of_club_hours_capped + summer_hours_capped;
        const pending_submissions = submissions.filter((s: any) => s.status === "pending").length;
        const approved_submissions = approvedSubmissions.length;

        // Calculate group leaderboard from submissions (not cached effectiveTotalHours)
        const groupMap = new Map<string, Group>();
        groups.forEach((g: any) => {
          groupMap.set(g.id, { groupId: g.id, leaderName: g.leaderName, memberCount: 0, totalHours: 0 });
        });

        // Calculate each user's hours from approved submissions
        const userHoursMap = new Map<string, { in_club: number; out_of_club: number; summer: number }>();
        approvedSubmissions.forEach((s: any) => {
          const userId = s.userId;
          const hours = Number(s.hoursCompleted) || 0;
          const current = userHoursMap.get(userId) || { in_club: 0, out_of_club: 0, summer: 0 };
          if (s.hourType === "In Club") current.in_club += hours;
          else if (s.hourType === "Out of Club") current.out_of_club += hours;
          else if (s.hourType === "Summer Hours") current.summer += hours;
          userHoursMap.set(userId, current);
        });

        // Apply caps per user and sum by group
        users.forEach((u: any) => {
          if (u.smallGroupId && groupMap.has(u.smallGroupId)) {
            const group = groupMap.get(u.smallGroupId)!;
            group.memberCount++;
            const hours = userHoursMap.get(u.id) || { in_club: 0, out_of_club: 0, summer: 0 };
            const out_of_club_capped = Math.min(hours.out_of_club, outOfClubHoursCap);
            const summer_capped = Math.min(hours.summer, summerHoursCap);
            const total = hours.in_club + out_of_club_capped + summer_capped;
            group.totalHours += total;
          }
        });

        setStats({
          total_hours,
          in_club_hours,
          out_of_club_hours: out_of_club_hours_capped,
          summer_hours: summer_hours_capped,
          total_members: users.length,
          pending_submissions,
          approved_submissions,
        });
        setGroups(Array.from(groupMap.values()).sort((a, b) => b.totalHours - a.totalHours));
      } catch (error) {
        console.error("Error loading index data:", error);
      }
    }
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-12 space-y-12">
        <section className="text-center space-y-4">
          <p className="text-sm uppercase tracking-wider text-muted-foreground">{settings?.academicYear || "Loading…"}</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Key Club Website
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Your one stop shop for all things Key Club. Review your previously submitted hours, find volunteer opportunities available, and log new hours. Track your attendance and stay connected through our Info Page.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            {user ? (
              <Link to="/dashboard"><Button size="lg">Go to My Hours</Button></Link>
            ) : (
              <>
                <Link to="/auth" search={{ mode: "signin" }}><Button size="lg">Sign in</Button></Link>
                <Link to="/auth" search={{ mode: "signup" }}><Button size="lg" variant="outline">Create account</Button></Link>
              </>
            )}
          </div>
        </section>

        <section>
          <StatCard 
            value={stats ? round(stats.total_hours) : "—"} 
            goal={1340}
            inClub={stats?.in_club_hours}
            outOfClub={stats?.out_of_club_hours}
            summer={stats?.summer_hours}
            settings={settings}
          />
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3">Group leaderboard</h2>
          {!groups ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : groups.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No groups yet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {groups.map((g, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-right font-mono text-sm text-muted-foreground">{i + 1}</span>
                      <div>
                        <p className="font-medium">{g.leaderName}</p>
                        <p className="text-xs text-muted-foreground">{g.memberCount} member{g.memberCount === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <span className="font-semibold">{round(g.totalHours)} hrs</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="text-sm text-muted-foreground border-t pt-6">
          <h3 className="font-semibold text-foreground mb-1">About Key Club</h3>
          <p>Key Club is a student-led organization that promotes service, leadership, and character through community volunteering. Members log hours by submitting an activity description, point of contact, and a photo as proof of attendance.</p>
          {settings?.instagramHandle && (
            <p className="mt-2">
              Follow us on Instagram:{" "}
              <a
                href={`https://instagram.com/${settings.instagramHandle.replace('@', '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-foreground hover:underline"
              >
                {settings.instagramHandle}
              </a>
            </p>
          )}
          <p className="mt-2">Website made by Joseph Ferrigno</p>
        </section>
      </main>
    </div>
  );
}

function StatCard({ value, goal, inClub, outOfClub, summer, settings }: { value: string | number; goal: number; inClub?: number; outOfClub?: number; summer?: number; settings?: Settings | null }) {
  const total = Number(value) || 0;
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const barColor = pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <Card>
      <CardContent className="py-6 space-y-3">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Club hours</p>
            <p className="text-5xl font-bold tabular-nums">{round(total)}</p>
          </div>
          <p className="text-sm text-muted-foreground">Goal: {goal} hrs</p>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className={`h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{round(total)} / {goal} hrs ({Math.round(pct)}%)</p>
        {inClub !== undefined && outOfClub !== undefined && summer !== undefined && (
          <div className="grid grid-cols-3 gap-3 pt-2 text-sm">
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">In Club</p>
              <p className="font-semibold">{round(inClub)}</p>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Out of Club</p>
              <p className="font-semibold">{round(outOfClub)}</p>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Summer</p>
              <p className="font-semibold">{round(summer)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function round(n: number) {
  return Math.round(Number(n) * 10) / 10;
}
