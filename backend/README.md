# MyBookshelf API

This folder is prepared to become a standalone backend repository.

## Endpoints

- `GET /api/health`
- `GET /api/books?page=0&pageSize=80&sort=title-asc&q=&series=` - filtered, sorted, paginated results
- `GET /api/series` - series filter options
- `GET /api/books/spine-crop` - full catalog for the crop editor, loaded only when opened
- `POST /api/books`
- `PUT /api/books/:uid`

`GET /api/books` responds with `{ books, total, page, pageSize, pageCount }`. The page size is capped at 100. The frontend submits search text only when the Search button is pressed or Enter is submitted; changing sort, series, or page runs a new server query.

## Local Run

1. `cp .env.example .env`
2. `npm install`
3. `npm run dev`

## Environment Variables

- `PORT` - API port (default: `4000`)
- `DB_PATH` - SQLite file path (default: `./data/books.db`)
- `SEED_PATH` - JSON seed file path (default: `./BookList.json`)
- `CORS_ORIGIN` - comma-separated allowed origins
- `SUPABASE_URL` - Supabase project URL (use the project base URL, not `/rest/v1/books`)
- `SUPABASE_SERVICE_ROLE_KEY` - private server-side Supabase key; never expose it to the frontend

When both Supabase variables are set, the API reads and writes the `public.books` table with `uid` (text primary key) and `book` (jsonb) columns. Run `supabase_books_schema.sql` in the Supabase SQL Editor to install indexes and the `search_books` RPC used for server-side library queries. When neither Supabase variable is set, the API uses local SQLite and optionally seeds from `SEED_PATH`.

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
