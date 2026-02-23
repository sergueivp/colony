# Firebase Backend Setup (ARES COMMAND)

## 1) Fill app config
Edit `firebase.config.js` and replace placeholders:
- `authDomain`
- `projectId`
- `appId`
- `databaseURL`

`apiKey` is already filled.

## 2) Set Firebase project id (only needed if using Firebase CLI deploy commands)
Edit `.firebaserc` and replace `REPLACE_ME` with your Firebase project id.

## 3) Enable products in Firebase console
- Realtime Database (start in test mode for classroom trust setup)
- Firestore Database (test mode for classroom trust setup)
- Firebase Hosting (optional; not required for GitHub Pages)

## 4) If you deploy with Firebase Hosting (optional)
From this folder run:

```bash
firebase login
firebase use <your-project-id>
firebase deploy
```

## Routes (regardless of hosting provider)
- `https://<your-host>/teacher.html`
- `https://<your-host>/student.html`
- `https://<your-host>/` (entry page)

For GitHub Pages instructions, use:
- `GITHUB_PAGES_SETUP.md`

## Runtime model
- Teacher controls session and teams from `teacher.html`
- Students join with per-team code in `student.html`
- Teacher can Start, Finish (hard lock), and Reset session
