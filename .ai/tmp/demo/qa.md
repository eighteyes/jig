---
jig: qa
title: Storage choices
multi: false
---
Round one. Pick what fits the team, not the hype.
## Which database?
- Postgres
  what:: joins and migrations, more ops work
- SQLite
  what:: one file, single writer
- DuckDB
## Which queue?
- Redis streams
- Postgres LISTEN/NOTIFY
  what:: no new service
## Where to host?
- Fly
- A box under the desk
