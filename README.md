# ServeTrack

**FBLA Coding & Programming (2026–2027)**  
Topic: *Serving the Community: Nonprofit Volunteer Management*

ServeTrack is a web application that helps nonprofit organizations **recruit volunteers**, **publish service opportunities**, **collect verified service hours**, and **monitor participation** for both volunteers and organization leaders.

## Run locally

```bash
cp .env.example .env   # uses your Firebase web config
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How the program addresses the topic

| Nonprofit need | ServeTrack feature |
| --- | --- |
| Recruit volunteers | Sign-up with roles (volunteer, guardian, coordinator, org admin) |
| Organize people | Teams, profiles, role requests |
| Manage service activities | Opportunities board with smart filters + recommendations |
| Maintain records | Hour submissions with photo proof + review workflow |
| Monitor participation | Dashboards, attendance tracking, customizable CSV reports |
| Support both audiences | Volunteer “My Service” + Admin tools |

## Language selection (rating sheet)

| Choice | Why |
| --- | --- |
| **TypeScript** | Static types catch data-shape bugs early (roles, hour types, Firestore docs). |
| **React + Next.js (App Router)** | Component modularity, file-based routes, fast local DX for an interactive UI. |
| **Firebase (Auth, Firestore, Storage)** | Managed auth + realtime documents fit volunteer records without running a custom server. |
| **Tailwind CSS + Radix UI** | Consistent, accessible UI primitives with clear visual hierarchy. |
| **TipTap** | Rich text for organization info pages without building an editor from scratch. |

## User journey (UX)

1. Volunteer creates an account and accepts organization expectations.  
2. A coordinator assigns the volunteer to a **team**.  
3. Volunteer browses / filters opportunities (and sees recommendations).  
4. Volunteer serves, then **submits hours** with description, contact, and photo proof.  
5. Coordinator **reviews** submissions; approved hours update totals.  
6. Leaders export **customizable reports** for analysis.

Accessibility notes: labeled form controls, keyboard-focusable nav/buttons, theme toggle, `aria-` labels on icon buttons, expandable Help Q&A.

## Intelligent features

- **Smart filters** on Opportunities (search, timeframe, hour range).  
- **Recommended for you** ranking (date proximity + hours).  
- Interactive **Help & Q&A** (`/help`) with searchable answers.

## Input validation

Shared helpers in `src/lib/validation.ts` check email format, names, phone digits, hour ranges/precision, description length, and proof image type/size (syntactic + semantic).

## Documentation packet

- Source: this repository (`src/`)  
- Libraries / attribution: see [`ATTRIBUTION.md`](./ATTRIBUTION.md)  
- Branding / label map: `src/lib/brand.ts`  
- Reports engine: `src/lib/reports.ts`  
- Recommendations: `src/lib/recommendations.ts`

## Project structure

```
src/app/           Next.js routes (volunteer + admin)
src/components/    Nav, UI primitives, providers
src/hooks/         Auth + theme
src/lib/           Firebase, validation, reports, recommendations, brand
```

## Scripts

- `npm run dev` — local development  
- `npm run build` — production build  
- `npm start` — run production build  
