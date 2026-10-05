# WorkSpace
# Job Tracker 
Joshua Chetram
10 - 5 - 2026


A full-stack web app for tracking job applications through Applied, Interview, Offer, and Rejected.

## Features

- Signup and login (bcrypt password hashing + JWT)
- Add, edit, and delete applications
- Filter by status
- Notes and follow-up dates (overdue follow-ups are flagged)
- Stats page: applications per week and response rate
- CSV export

## Stack

Node, Express, SQLite (better-sqlite3), plain JavaScript front end.

## Run it locally

```bash
npm install
JWT_SECRET=pick-a-long-random-string npm start
```

Then open http://localhost:3000.

## Database

- `users(id, email, password_hash)`
- `applications(id, user_id -> users, company, role, status, applied_date, follow_up_date, notes, created_at)`

Every query is scoped by `user_id`, so users only see their own data.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | /api/signup, /api/login | Returns a JWT |
| GET/POST | /api/applications | List (optional `?status=`) / create |
| PUT/DELETE | /api/applications/:id | Update / delete |
| GET | /api/stats | Weekly counts and response rate |
| GET | /api/export.csv | CSV download |

## Next steps

- Email reminders for follow-ups (node-cron + nodemailer)
- Deploy on Render or Railway (set `JWT_SECRET`, and use a persistent disk for the SQLite file, or switch to PostgreSQL)
