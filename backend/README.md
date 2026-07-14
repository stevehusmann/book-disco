# MyBookshelf API

This folder is prepared to become a standalone backend repository.

## Endpoints

- `GET /api/health`
- `GET /api/books`
- `POST /api/books`
- `PUT /api/books/:uid`

## Local Run

1. `cp .env.example .env`
2. `npm install`
3. `npm run dev`

## Environment Variables

- `PORT` - API port (default: `4000`)
- `DB_PATH` - SQLite file path (default: `./data/books.db`)
- `SEED_PATH` - JSON seed file path (default: `./BookList.json`)
- `CORS_ORIGIN` - comma-separated allowed origins

## Splitting Into A Separate Repo

1. Create a new empty GitHub repo (for example `mybookshelf-api`).
2. Copy this folder's contents into the new repo root.
3. Commit and push.
4. Deploy to Render/Railway/Fly.
5. Set `DB_PATH` to persistent disk location on your host (example Render: `/var/data/books.db`).
6. Upload/copy your `BookList.json` and set `SEED_PATH` if needed.

## Frontend Integration

In your frontend repo, set:

- `REACT_APP_API_BASE_URL=https://your-api-domain`

The frontend can then call this backend from Vercel.
