import { Link, Outlet } from "@tanstack/react-router";

const NAV = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/games", label: "Game types", exact: false },
  { to: "/admin/hands", label: "Hands", exact: false },
  { to: "/admin/players", label: "Players", exact: false },
  { to: "/admin/tape", label: "Tape", exact: false },
] as const;

const linkClass =
  "flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-medium text-cream transition-colors duration-200 hover:bg-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const roomLinkClass =
  "inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-gold transition-colors duration-200 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export function AdminShell() {
  return (
    <div className="room flex min-h-dvh flex-col text-cream md:flex-row">
      <aside className="sticky top-0 z-20 flex flex-col border-b border-line bg-felt-deep md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-end justify-between gap-3 px-4 pt-4 pb-1 md:px-5 md:pt-8">
          <div>
            <p className="hidden text-xs font-medium uppercase tracking-widest text-gold md:block">Admin</p>
            <p className="font-display text-3xl leading-none text-cream">House book</p>
          </div>
          <Link to="/" className={`${roomLinkClass} md:hidden`}>
            Back to the room
          </Link>
        </div>
        <nav aria-label="House book" className="flex gap-1 overflow-x-auto px-3 py-2 md:mt-4 md:flex-col md:overflow-visible md:px-3">
          {NAV.map((item) =>
            item.to === "/admin/hands" ? (
              <Link
                key={item.label}
                to={item.to}
                search={{ game: "all" }}
                activeOptions={{ exact: item.exact, includeSearch: false }}
                className={linkClass}
                activeProps={{ className: "bg-rail text-gold" }}
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: item.exact, includeSearch: false }}
                className={linkClass}
                activeProps={{ className: "bg-rail text-gold" }}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="mt-auto hidden px-5 pb-6 md:block">
          <Link to="/" className={roomLinkClass}>
            Back to the room
          </Link>
          <p className="mt-3 text-sm text-muted">Finished hands and session tapes stay with the room. The cage is separate.</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
          <Outlet />
          <p className="mt-10 text-sm text-muted md:hidden">Finished hands and session tapes stay with the room. The cage is separate.</p>
        </main>
      </div>
    </div>
  );
}
