# StudioSpace Server

Express + MongoDB API for the StudioSpace studio booking platform.

## Requirements

- Node.js 18 or newer (Node 20/22/24 recommended)
- A MongoDB database (local or MongoDB Atlas)
- The Better Auth Next.js client running on `http://localhost:3000`

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your real values
npm run seed   # optional: adds 12 demo studios and 2 confirmed bookings
npm run dev    # development (auto-restart)
# or
npm start      # production
```

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Never commit `.env`. It is already listed in `.gitignore`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_DB_SERVER` | yes | MongoDB connection string. `MONGODB_URI` is accepted as a fallback. |
| `MONGO_DB_NAME` | no | Database name. Defaults to `studiospace`. |
| `JWT_SECRET` | yes | Random string, at least 32 characters. Used to sign the HTTPOnly JWT cookie. |
| `BETTER_AUTH_URL` | no | Better Auth base URL. Defaults to `http://localhost:3000`. |
| `CLIENT_URL` | no | Comma-separated allowed browser origins (CORS). |
| `PORT` | no | API port. Defaults to `5000`. |
| `LEGACY_PORT` | no | Optional second listener for the old frontend. Defaults to `8000` in development. Set to `off` to disable. |
| `NODE_ENV` | no | `development` or `production`. Production uses `secure` / `SameSite=None` cookies. |

## Ports

- `5000` is the primary API used by `studiospace-client` (`NEXT_PUBLIC_API_URL=http://localhost:5000`).
- In development the same app also listens on `8000` so the older StudioSpace frontend (which hardcodes port 8000) keeps working.
- Deployment platforms set `PORT` automatically; the legacy listener is disabled in production unless `LEGACY_PORT` is explicitly set.

## Authentication flow

1. The user signs in through Better Auth in the Next.js client.
2. The client calls `POST /api/auth/jwt` with `credentials: "include"`.
3. This server verifies the Better Auth session cookie against `BETTER_AUTH_URL/api/auth/get-session`.
4. If valid, the server signs a JWT and stores it in an HTTPOnly cookie (`studiospace_token`).
5. Protected routes accept the JWT cookie, or fall back to verifying the Better Auth session cookie directly.

The client-supplied user object in the `/api/auth/jwt` request body is ignored; identity always comes from the verified Better Auth session.

`POST /api/auth/logout` clears the JWT cookie.

## API

### Studios

- `GET /api/studios` — list/search/sort studios.
  - Query: `category`, `search`, `sort` (`rating`, `price-asc`, `price-desc`), `limit`, `page`.
  - Without `page`: returns `Studio[]` (home page featured list).
  - With `page`: returns `{ studios, total, page, limit }` (Explore page).
- `GET /api/studios/:id` — one studio.
- `POST /api/studios` — protected; create a listing.
- `PATCH /api/studios/:id` — protected; owner only.
- `DELETE /api/studios/:id` — protected; owner only. Related wishlist/review entries are removed; bookings are kept as history.
- `GET /api/my-studios` — protected; listings owned by the logged-in user.

### Bookings

- `POST /api/bookings` — protected; create a booking. Price is calculated on the server. Past dates and overlaps with confirmed bookings are rejected (`409`).
- `GET /api/my-bookings` — protected; bookings made by the logged-in user.
- `GET /api/bookings/incoming` — protected; bookings on the logged-in user's studios.
- `PATCH /api/bookings/:id/cancel` — protected; booking owner, pending bookings only.
- `PATCH /api/bookings/:id/status` — protected; studio owner only, accepts `Confirmed` or `Completed`. Confirming re-checks for overlaps.

### Wishlist and dashboard

- `GET /api/wishlist` — protected; optional `?studioId=...`.
- `POST /api/wishlist/:studioId` — protected; body `{ "action": "add" | "remove" }`.
- `GET /api/dashboard-stats` — protected; `{ listings, bookings, pending }`.

### Auth

- `POST /api/auth/jwt` — exchange a valid Better Auth session for the HTTPOnly JWT cookie.
- `POST /api/auth/logout` — clear the JWT cookie.

### Legacy endpoints (kept for the old frontend)

- `POST /singer-form`
- `POST /my-bookings`
- `GET /my-bookings`
- `PUT /my-bookings/:id`
- `DELETE /my-bookings/:id`

These keep their original request/response formats and collection names (`singer`, `my-bookings`).

## Status codes

- `400` invalid input
- `401` not logged in / invalid session
- `403` logged in but not the owner
- `404` not found
- `409` booking time conflict
- `500` server error (details are logged server-side only)

## Demo data

`npm run seed` inserts 12 studios and 2 confirmed bookings on `2030-01-15` and `2030-01-16`. It is idempotent and uses `seedKey` fields so re-running it does not duplicate data. To create the examiner account, register `examiner@studiospace.com` with password `Studio123` through the client.

To remove only the seeded demo documents (never your own data), run:

```bash
npm run seed:clean
```
