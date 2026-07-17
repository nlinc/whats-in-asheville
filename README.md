# Asheville Condo Tracker

Small Firebase-backed tracker for Asheville condo inventory, trip prep tasks, and closet/cabinet photos.

## Firebase setup checklist

Project: `lincoln-second-home`

1. Enable Cloud Firestore for the project.
   - Use Native mode.
   - Location recommendation: `nam5` or another US multi-region.
2. Enable Firebase Storage for the project.
3. Enable Authentication > Sign-in method > Google.
4. Deploy rules and hosting:

```sh
firebase deploy --only firestore:rules,storage,hosting
```

The app will work locally without Firebase, but shared sync and cloud photos require those services.
