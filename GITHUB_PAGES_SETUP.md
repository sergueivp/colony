# GitHub Pages Setup (ARES COMMAND)

This app is static and can be hosted on GitHub Pages. Firebase is still used for live data.

## 1) Fill Firebase web config
Edit `firebase.config.js` and replace placeholders:
- `authDomain`
- `projectId`
- `appId`
- `databaseURL`

`apiKey` is already set.

## 2) Push to GitHub
Push this folder to a GitHub repository.

## 3) Enable GitHub Pages
Recommended: use GitHub Actions deployment (workflow already included at `.github/workflows/pages.yml`).

In GitHub:
- `Settings` -> `Pages`
- Source: `GitHub Actions`

After pushing to `main`, Pages deploys automatically.

## 4) Open routes
- `https://<username>.github.io/<repo>/` (entry)
- `https://<username>.github.io/<repo>/teacher.html`
- `https://<username>.github.io/<repo>/student.html`

## 5) Firebase backend notes
GitHub Pages only hosts files. It does **not** apply Firebase rules.

You must configure Firebase project resources separately:
- Realtime Database enabled
- Firestore enabled
- Rules configured in Firebase Console (or via Firebase CLI)

If your API key has HTTP referrer restrictions, allow your Pages origin:
- `https://<username>.github.io`

## 6) Runtime model
- Teacher uses `teacher.html` to manage teams, budgets, start/finish/reset.
- Students use `student.html` and join with a team code.
- Finish triggers hard lock for students.
