# FocusTrackAttend – Jury Demo Guide

This guide helps you stop/start the app quickly and present a smooth end‑to‑end demo.

## Prerequisites
- Node.js and npm installed
- Firebase project configured in `src/lib/firebase.ts`
- At least one Faculty and one Student user in Firebase Auth/Firestore (or sign up from the app)

## Start/Stop (Development)
- Stop server:
  - In the terminal running the dev server, press `Ctrl + C` and confirm if prompted.
- Start server:
  - Open terminal in project root
  - Install packages (first time or after changes):
    ```bash
    npm install
    ```
  - Start Vite dev server:
    ```bash
    npm run dev
    ```
  - Open the printed local URL (e.g., http://localhost:5173)
  - If the port is busy, use another port:
    ```bash
    npx vite --port 5174
    ```

## Roles and Single Auth Pages
- Home (`/`) shows a single Login page with role selector (Student/Faculty/Admin/Super Admin)
- Single Sign Up page for all roles at `/signup` (role can be preselected via `?role=`)

## Data Persistence (Where things are stored)
- Auth users: Firebase Authentication
- User profiles/roles: Firestore `users/<uid>`
- Active/Ended sessions: Firestore `sessions` + subcollection `participants`
- Archived attendance: Firestore `attendance`
- Face captures: Firebase Storage `sessions/<sessionId>/participants/<uid>.jpg`

All data persists in Firebase across server restarts.

## Recommended Demo Script (5–7 minutes)
1. Faculty Login
   - Select role: Faculty
   - Login using email/ID + password
   - Navigate to `Faculty Dashboard`
2. Start a Session
   - Pick Class, Threshold, Radius
   - Click "Start Session" (note the code)
3. Student Login (second window/incognito)
   - Select role: Student
   - Login and go to `Student Dashboard`
4. Join Session
   - Join via Active Session card or enter code
   - Face Verification dialog opens → click "Capture & Join"
   - App navigates to Focus Mode page with countdown
5. End Session (Faculty)
   - Click "Stop Session" → automatic redirect to Final Summary
   - Adjust statuses (Present/Late/Absent)
   - Click "Submit Attendance" → returns to Faculty Dashboard
6. Highlight Persistence
   - Show `attendance` entry exists (if you have Firestore console open)

## Testing Tips
- Camera/GPS Permissions
  - Accept browser prompts. For mobile over LAN (http), some browsers block camera/GPS. Use desktop localhost or an HTTPS tunnel (e.g., ngrok).
- Dual Sessions (Faculty & Student)
  - Use two different browser profiles or one normal window + Incognito.
- If the timer finishes
  - Focus Mode ends for the student; faculty can still view Final Summary.

## Troubleshooting
- Port already in use
  - Close the previous terminal or run `npx vite --port 5174`
- Login fails
  - Verify the account exists in Firebase Authentication and the `users/<uid>` document has a `role` field.
- Student cannot see active session
  - Check Firestore `sessions` has `status: 'active'` and the same project is configured in `src/lib/firebase.ts`.
- Camera stays on after joining
  - We stop the stream before navigation and enforce shutdown again in Focus Mode. If your OS keeps the LED on briefly, wait up to 3 seconds.

## Privacy Note
- Face captures are stored in Firebase Storage only for the session; attendance summaries store the `facePhotoUrl` reference if available. Ensure you comply with your institution’s privacy policy when recording or displaying captured images.
