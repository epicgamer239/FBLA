"use client";

import { useMemo, useState } from "react";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";

type QA = { q: string; a: string; tags: string[] };

const FAQ: QA[] = [
  {
    q: "What is ServeTrack?",
    a: "ServeTrack is a nonprofit volunteer management app. Volunteers browse service opportunities and submit hours with photo proof. Coordinators review submissions, organize teams, track attendance, and export participation reports.",
    tags: ["overview", "topic", "nonprofit"],
  },
  {
    q: "How do I create an account?",
    a: "Open Sign in → Create account. Enter your name, email, password, and role. Coordinators/org admins start as volunteers until a reviewer approves an elevated role request.",
    tags: ["signup", "auth"],
  },
  {
    q: "How do I log volunteer hours?",
    a: "After you are assigned to a team, go to Submit. Describe the activity, add a point of contact, enter hours, choose Organization / Community / Seasonal, and attach a clear photo as proof.",
    tags: ["submit", "hours", "proof"],
  },
  {
    q: "What do Organization, Community, and Seasonal hours mean?",
    a: "Organization hours are sponsored by your nonprofit. Community hours are independent activities (often pre-approved). Seasonal hours cover summer/seasonal campaigns and may have a cap set by leaders.",
    tags: ["hour types", "caps"],
  },
  {
    q: "Why can’t I submit hours yet?",
    a: "Submissions require a team assignment so hours roll up to the correct group totals. Ask a coordinator to place you on a team from Admin → Volunteers.",
    tags: ["team", "submit", "blocked"],
  },
  {
    q: "How do leaders approve hours?",
    a: "Coordinators open Admin → Review submissions, inspect the proof image, then approve or decline. Approved hours appear on volunteer dashboards and reports.",
    tags: ["admin", "review"],
  },
  {
    q: "Where can leaders analyze participation?",
    a: "Use Admin → Reports to filter by status, hour type, and date range, view summary totals, and download a CSV for custom analysis in a spreadsheet.",
    tags: ["reports", "csv", "analysis"],
  },
  {
    q: "How does opportunity recommendation work?",
    a: "On Opportunities, ServeTrack scores upcoming events using date proximity, possible hours, and keyword overlap with your recent activity text — then surfaces a short Recommended for you list.",
    tags: ["intelligent", "recommendations"],
  },
  {
    q: "Is my data validated?",
    a: "Yes. Forms check email format, phone digits, name characters, hour ranges (0–24, one decimal), description length, and proof image type/size before writing to Firebase.",
    tags: ["validation", "errors"],
  },
  {
    q: "Volunteer journey (user flow)",
    a: "1) Sign up 2) Get assigned to a team 3) Browse/filter opportunities 4) Serve 5) Submit hours + proof 6) Track progress on My Service 7) Leaders review and report.",
    tags: ["ux", "journey", "accessibility"],
  },
];

function HelpPage() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.filter((item) => {
      const hay = `${item.q} ${item.a} ${item.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Help &amp; Q&amp;A</h1>
          <p className="text-muted-foreground mt-2">
            Interactive guidance for {BRAND.name}. Search common questions or browse the volunteer journey.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ask a question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="sr-only" htmlFor="help-search">
              Search help topics
            </label>
            <Input
              id="help-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. submit hours, reports, team assignment…"
              aria-describedby="help-hint"
            />
            <p id="help-hint" className="text-xs text-muted-foreground">
              Tip: try keywords like “proof”, “CSV”, “recommend”, or “approve”.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3" role="list">
          {results.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No matches. Try a shorter keyword.
              </CardContent>
            </Card>
          ) : (
            results.map((item) => {
              const idx = FAQ.indexOf(item);
              const open = openId === idx;
              return (
                <Card key={item.q} role="listitem">
                  <button
                    type="button"
                    className="w-full text-left px-6 py-4 font-medium hover:bg-muted/40 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : idx)}
                  >
                    {item.q}
                  </button>
                  {open && (
                    <CardContent className="pt-0 pb-5 text-sm text-muted-foreground leading-relaxed">
                      {item.a}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

export default HelpPage;
