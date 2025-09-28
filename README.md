# FocusTrackAttend – Attendance Management

Modern attendance system with real‑time sessions, student focus mode, quick face snapshot, GPS/Wi‑Fi context, and verification code workflow.

## Features

- **Student Active Join only**: Students can join from `Active Sessions` on the dashboard. No join‑by‑code UI.
- **Auto face capture on join**: Camera opens and silently captures a snapshot, then joins.
- **Focus Mode**: Fullscreen, timer, and session details for the student.
- **10‑second code verification**: A dialog appears 10s after entering Focus Mode; student must input the session code.
- **3‑attempt limit**: After 3 wrong codes, the student is auto‑exited and marked Absent. If they re‑enter later and verify correctly, status is restored to Present.
- **Faculty dashboard**: Start/stop sessions, view live participants, see recent sessions.
- **Recent lists**: Student and Faculty recents show newest first.

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Firebase (Auth, Firestore, Storage)
- React Router, React Query

## Project Structure (key)

- `src/pages/Index.tsx` – Landing/Login shell
- `src/pages/Login.tsx`, `src/pages/SignUp.tsx`, `src/pages/Reset.tsx`, `src/pages/OtpLogin.tsx`
- `src/pages/StudentDashboard.tsx` – Student home, Active Sessions, auto face capture join
- `src/pages/FocusMode.tsx` – Student focus experience + code verification flow
- `src/pages/FacultyDashboard.tsx` – Host sessions and monitor
- `src/pages/FinalSummary.tsx` – Post‑session summary
- `src/contexts/AuthContext.tsx` – Auth state
- `src/lib/firebase.ts` – Firebase initialization

## Getting Started

Prereqs:

- Node.js 18+ and npm
- A Firebase project (Firestore + Authentication enabled; optional Storage)

Install and run:

```bash
npm install
npm run dev
```

Open the URL printed by Vite (typically http://localhost:5173).

## Firebase Setup

1) Create a Firebase project and enable:

- Authentication (Email/Password or your preferred providers)
- Firestore (Native mode)
- Storage (optional; we default uploads off in dev)

2) Add a Web App to obtain config and set environment variables. Create `.env` in the project root:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

3) Firestore collections (created on demand):

- `sessions/{sessionId}`
  - Fields: `status` ('active'|'ended'), `code`, `class`, `endsAtMs`, `facultyId`, `createdAt`, ...
  - Subcollection: `participants/{uid}` with `present`, `status`, `joinedAt`, `faceUrl?`, `codeVerified?`, etc.
- `attendance/{attendanceId}` – summary documents written on session end.

4) Example security rules (adapt to your needs):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read: if request.auth != null;
      // faculty ownership checks omitted for brevity

      match /participants/{uid} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == uid;
      }
    }

    match /attendance/{id} {
      allow read: if request.auth != null;
      // writes typically by server or faculty only
    }
  }
}
```

## Core Flows

- **Faculty starts a session** (Faculty Dashboard)
  - Generates a 6‑char code and sets `status: 'active'`, `endsAtMs`.

- **Student joins from Active Sessions** (Student Dashboard)
  - Click Join → camera opens → snapshot auto‑captured → participant doc written with `present: true`.
  - Enters Focus Mode full screen and navigates to `/focus/:sessionId`.

- **10‑second verification** (Focus Mode)
  - Dialog opens after 10s; student must enter the session code.
  - Up to 3 attempts. On 3rd failure → exit focus mode, mark participant:
    - `status: 'absent'`, `present: false`, `exitedEarly: true`, `codeAttemptsExceeded: true`.
  - On success → mark:
    - `status: 'present'`, `present: true`, `codeVerified: true`, `codeVerifiedAt`.
  - If student re‑joins later and verifies successfully, they are restored to Present.

## Configuration Notes

- Auto‑upload of face snapshot to Firebase Storage is disabled by default during development to avoid CORS issues. Toggle in `StudentDashboard.tsx` via `ENABLE_STORAGE_UPLOAD`.
- Recent lists are sorted newest‑to‑oldest client‑side to remain correct even if Firestore falls back to non‑indexed queries.

## Scripts

- `npm run dev` – Start Vite dev server
- `npm run build` – Production build
- `npm run preview` – Preview production build locally

## Troubleshooting

- **Camera not opening**: Ensure browser permission is granted and no other app is using the camera. On desktop with multiple cameras, try switching defaults.
- **Auto‑capture doesn’t trigger**: Make sure the site tab is active and the camera preview is visible. The app waits for `canplay`/dimensions before capturing.
- **Verification dialog not appearing**: It opens 10 seconds after entering Focus Mode. Verify the session is active and the page remains focused.
- **Writes denied**: Check Firestore rules so students can write to their own `participants` document.

## License

This project is provided as‑is for educational and internal use. Review and adjust security rules and privacy practices before production use.
