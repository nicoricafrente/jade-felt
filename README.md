# Jade Felt

Jade Felt is a private card room in the browser. Four tables share one cage of play-money chips: no-limit Hold'em, blackjack, Tong-its, and Chinese poker. Sit down, play a sitting, cash out. The buy-in leaves the cage and returns when you stand up.

The House book sits next to the lobby. Finished hands, player nets, and a full session tape live there. Open a sitting and press Play to walk the table back through every sit-down, chip move, turn, check, fold, raise, draw, and throw.

Play money only.

## Tables

| Table | Game | Buy-in |
| --- | --- | --- |
| Hold'em | No-limit, three seats, blinds 10 and 20 | 500 |
| Blackjack | Four-deck shoe, dealer stands on every 17 | 400 |
| Tong-its | Melds, lay-offs, and a fight for the low count | 300 |
| Chinese poker | Thirteen cards across back, middle, and front | 400 |

Regulars at the tables are Mina, Rafa, Liza, Nico, Wen, and Paolo. House rules and per-table rules are in the lobby and at each seat.

## House book

The House book is at `/admin`.

- **Overview**: hands, your net, wins, and the latest booked results
- **Game types**: net at each table
- **Hands**: the full book, filterable by game
- **Players**: seat stats across the sitting
- **Tape**: every session event with a timestamp, plus replay, export, and import

The cage (chips on this device) is separate from the book. Closing the server window starts the book fresh the next time, unless you point the app at a real Postgres URL.

## Requirements

- Node.js 22 LTS, actually installed (the `.msi` on Windows is the sure path)
- npm (ships with Node.js)
- An internet connection the first time, so packages can download

On Windows 10 or 11, a PowerShell download, winget, or a version manager often does not put `node.exe` where a double-clicked starter can see it. The starter reads the installed PATH itself and also looks in Program Files, fnm, nvm, Volta, Scoop, and WinGet.

## Run on Windows

1. Put this folder somewhere you can write to, such as `Documents\Jade Felt`. Do not run it from inside a zip.
2. Double-click `Start Jade Felt.bat`.
3. Leave that window open. The room opens at http://127.0.0.1:8080. If the page is not ready yet, wait a few seconds and refresh.
4. To stop, close that window, or press Ctrl+C in it.

If Windows asks about a firewall, allow the app on private networks.

If the starter still says Node.js is missing:

1. Open a new PowerShell window and run `node -v`.
2. If that is not recognized, run the Node.js `.msi` again and leave "Add to PATH" checked.
3. If that prints `v22` or newer, double-click the bat file again.

## Run from the command line

```bash
npm install
npm run dev
```

The dev server binds to `0.0.0.0:8080`. Open http://127.0.0.1:8080.

Other scripts:

```bash
npm run build          # production build, then apply SQL migrations
npm run preview        # serve the production build (port 8081)
npm run typecheck      # TypeScript, no emit
npm test               # script and library tests
npm run lint           # ESLint
npm run format         # Prettier
npm run db:migrate     # apply migrations/*.sql
```

`startup.sh` is the preview-host entry used when this workspace is launched inside the Grok sandbox.

## Stack

- React 19 and TypeScript
- TanStack Start, Router, and Query
- Vite 8 and Tailwind CSS 4
- Better Auth (off in this workspace)
- PGLite in preview (Postgres compiled to WASM). Set `DATABASE_URL` to use Neon or another Postgres server instead.
- SQL migrations under `migrations/`

Chip balances live in `localStorage` on this device. The house book and session tape live in the database. PGLite is in-memory, so a restart clears the book. A configured `DATABASE_URL` keeps the book across restarts.

`.env` holds optional SQL Server fields from an earlier path. The live app reads `DATABASE_URL` for Postgres, or falls back to PGLite when that variable is empty.

## Layout

```
src/components/games/   table UIs
src/lib/cards/          rules and evaluators
src/lib/wallet.ts       cage and buy-ins
src/lib/ledger.ts       house book shapes
src/lib/session-tape.ts session event recording
src/routes/admin/       house book pages
migrations/             schema
Start Jade Felt.bat     Windows starter
```

## License

Private project. Play money only. No wagering.
