import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { PlayingCard } from "@/components/playing-card";
import { GAME_CATALOG } from "@/lib/ledger";
import { importSession, listSessions, readSession } from "@/lib/session-tape.functions";
import { downloadSessionTranscript, parseSessionTranscript } from "@/lib/session-transcript";
import type { SessionRow, TapeCard, TapeEvent, TapeView } from "@/lib/session-tape.types";
import type { Rank, Suit } from "@/lib/cards/model";
import { cn } from "@/lib/cn";

function clock(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(at);
}

function when(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

function gameName(id: string): string {
  return GAME_CATALOG.find((game) => game.id === id)?.name ?? id;
}

export function SessionDesk() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportSitting(row: SessionRow, known?: TapeEvent[]) {
    setSaving(row.id);
    setExportError(null);
    try {
      const events = known ?? (await readSession({ data: { sessionId: row.id } }));
      downloadSessionTranscript(row, events);
    } catch {
      setExportError("The text file didn't save.");
    } finally {
      setSaving(null);
    }
  }

  async function importFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportNote(null);
    let ok = 0;
    let lastId: string | null = null;
    let badFile = false;
    let badSave = false;
    for (const file of Array.from(list)) {
      try {
        const text = await file.text();
        const parsed = parseSessionTranscript(text);
        console.log(`parsed`, parsed)
        const saved = await importSession({ data: parsed });
        ok += 1;
        lastId = saved.id;
      } catch (err) {
        if (err instanceof Error && err.message === "That file isn't a Jade Felt tape.") badFile = true;
        else badSave = true;
      }
    }
    if (ok > 0) {
      try {
        setRows(await listSessions());
        setError(null);
        if (lastId) setOpenId(lastId);
      } catch {
        setError("The tape didn't open.");
      }
      setImportNote(ok === 1 ? "That sitting is on the tape." : `${ok} sittings are on the tape.`);
    }
    if (badFile) setImportError("That file isn't a Jade Felt tape.");
    else if (badSave) setImportError("The tape didn't take that file.");
    if (fileRef.current) fileRef.current.value = "";
    setImporting(false);
  }

  useEffect(() => {
    let gone = false;
    listSessions()
      .then((next) => {
        if (gone) return;
        setRows(next);
        setReady(true);
      })
      .catch(() => {
        if (gone) return;
        setError("The tape didn't open.");
        setReady(true);
      });
    return () => {
      gone = true;
    };
  }, []);

  const selected = rows.find((row) => row.id === openId) ?? null;

  return (
    <div className="mt-8">
      {error && <p className="text-sm text-suit">{error}</p>}
      {exportError && <p className="mt-3 text-sm text-suit">{exportError}</p>}
      {importError && <p className="mt-3 text-sm text-suit">{importError}</p>}
      {importNote && <p className="mt-3 text-sm text-gold">{importNote}</p>}
      {ready && (
        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden={true}
            disabled={importing}
            onChange={(change) => void importFiles(change.target.files)}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium text-cream hover:bg-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import txt"}
          </button>
        </div>
      )}
      {!ready ? (
        <p className="mt-4 text-sm text-muted">Opening the tape…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No sessions yet. Sit at a table, then cash out, or import a saved tape.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-stretch gap-2">
              <button
                type="button"
                onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
                aria-pressed={openId === row.id}
                className={cn(
                  "flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 rounded-2xl border px-4 py-3 text-left transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                  openId === row.id ? "border-gold bg-rail" : "border-line bg-rail/60 hover:border-gold",
                )}
              >
                <span>
                  <span className="block font-medium text-cream">{gameName(row.game)}</span>
                  <span className="block text-sm text-muted">
                    {when(row.startedAt)}
                    {row.endedAt ? "" : " · still open"}
                    {" · "}
                    {row.events} {row.events === 1 ? "move" : "moves"}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-gold">
                  In {row.buyIn}
                  {row.cashOut == null ? "" : ` · out ${row.cashOut}`}
                </span>
              </button>
              <button
                type="button"
                disabled={saving === row.id}
                onClick={() => void exportSitting(row)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium text-cream hover:bg-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50"
              >
                {saving === row.id ? "Saving…" : "Export txt"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <Replay session={selected} onExport={(events) => void exportSitting(selected, events)} saving={saving === selected.id} />}
    </div>
  );
}

function Replay({
  session,
  onExport,
  saving,
}: {
  session: SessionRow;
  onExport: (events: TapeEvent[]) => void;
  saving: boolean;
}) {
  const [events, setEvents] = useState<TapeEvent[] | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    setEvents(null);
    setIndex(0);
    setPlaying(false);
    setError(null);
    readSession({ data: { sessionId: session.id } })
      .then((next) => {
        if (gone) return;
        setEvents(next);
      })
      .catch(() => {
        if (gone) return;
        setError("That session didn't load.");
        setEvents([]);
      });
    return () => {
      gone = true;
    };
  }, [session.id]);

  useEffect(() => {
    if (!playing || !events || events.length === 0) return undefined;
    if (index >= events.length - 1) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => Math.min(current + 1, (events.length || 1) - 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, events, index]);

  const event = events?.[index] ?? null;

  return (
    <div className="mt-4 rounded-3xl border border-line bg-felt-light/30 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Replay</p>
          <h3 className="font-display text-2xl text-cream">{gameName(session.game)}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm tabular-nums text-muted">{event ? clock(event.at) : when(session.startedAt)}</p>
          <button
            type="button"
            disabled={!events || events.length === 0 || saving}
            onClick={() => events && onExport(events)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-medium text-cream hover:bg-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Export txt"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-suit">{error}</p>}
      {!events && <p className="mt-4 text-sm text-muted">Loading the record…</p>}
      {events && events.length === 0 && <p className="mt-4 text-sm text-muted">This sitting has no moves yet.</p>}

      {event && (
        <>
          <p className="mt-3 text-cream">{event.detail}</p>
          <p className="text-xs uppercase tracking-widest text-gold">
            {event.kind} · {event.actor}
          </p>
          <Felt view={event.view} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Transport label="First move" onClick={() => { setPlaying(false); setIndex(0); }}>
              <SkipBack className="size-4" aria-hidden />
            </Transport>
            <Transport
              label="Previous move"
              onClick={() => {
                setPlaying(false);
                setIndex((current) => Math.max(0, current - 1));
              }}
            >
              Back
            </Transport>
            <Transport label={playing ? "Pause replay" : "Play replay"} onClick={() => setPlaying((current) => !current)}>
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {playing ? "Pause" : "Play"}
            </Transport>
            <Transport
              label="Next move"
              onClick={() => {
                setPlaying(false);
                setIndex((current) => Math.min((events?.length ?? 1) - 1, current + 1));
              }}
            >
              Next
            </Transport>
            <Transport
              label="Last move"
              onClick={() => {
                setPlaying(false);
                setIndex((events?.length ?? 1) - 1);
              }}
            >
              <SkipForward className="size-4" aria-hidden />
            </Transport>
            <p className="text-sm tabular-nums text-muted">
              {index + 1} / {events?.length ?? 0}
            </p>
          </div>
          <label className="mt-3 block">
            <span className="sr-only">Replay position</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, (events?.length ?? 1) - 1)}
              value={index}
              onChange={(change) => {
                setPlaying(false);
                setIndex(Number(change.target.value));
              }}
              className="w-full accent-gold"
              aria-valuetext={`${index + 1} of ${events?.length ?? 0}, ${event.detail}`}
            />
          </label>
          <ol className="mt-4 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {events?.map((row, rowIndex) => (
              <li key={row.id}>
                <button
                  type="button"
                  ref={(node) => {
                    if (rowIndex === index) node?.scrollIntoView({ block: "nearest" });
                  }}
                  onClick={() => {
                    setPlaying(false);
                    setIndex(rowIndex);
                  }}
                  className={cn(
                    "flex w-full gap-3 rounded-xl px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                    rowIndex === index ? "bg-rail text-cream" : "text-muted hover:bg-rail/50",
                  )}
                >
                  <span className="w-24 shrink-0 tabular-nums">{clock(row.at)}</span>
                  <span className="w-20 shrink-0 uppercase tracking-wide text-gold">{row.kind}</span>
                  <span className="min-w-0">{row.detail}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function Transport({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-3 text-sm font-medium text-cream hover:bg-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {children}
    </button>
  );
}

function Felt({ view }: { view: TapeView }) {
  const slots = view.game === "holdem" ? 5 : view.board.length;
  return (
    <div className="mt-4 flex flex-col gap-3">
      {(view.pot > 0 || view.board.length > 0 || slots > 0) && view.game === "holdem" && (
        <div className="rounded-2xl border border-line bg-felt-light/40 px-3 py-4 text-center">
          <p className="font-display text-xl tabular-nums text-gold">Pot {view.pot}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
            {Array.from({ length: slots }, (_, slot) => {
              const card = view.board[slot];
              return card ? <TapeFace key={card.id} card={card} /> : <div key={slot} className="h-16 w-11 rounded-md border border-dashed border-line" />;
            })}
          </div>
        </div>
      )}
      {view.game !== "holdem" && view.pot > 0 && (
        <p className="text-center font-display text-xl tabular-nums text-gold">Pot {view.pot}</p>
      )}
      {view.discard.length > 0 && (
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted">Thrown</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {view.discard.map((card) => (
              <TapeFace key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {view.seats.map((seat) => (
          <div
            key={seat.name}
            className={cn(
              "rounded-2xl border p-3",
              seat.acting ? "border-gold bg-rail" : "border-line bg-rail/60",
              seat.folded && "opacity-60",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-cream">
                {seat.name}
                {seat.acting ? " · turn" : ""}
                {seat.folded ? " · folded" : ""}
              </p>
              {(seat.name === "You" || seat.stack > 0) && <p className="tabular-nums text-gold">{seat.stack}</p>}
            </div>
            <p className="text-sm text-muted">
              {seat.bet > 0 ? `Bet ${seat.bet}` : seat.tag || " "}
              {seat.bet > 0 && seat.tag ? ` · ${seat.tag}` : ""}
            </p>
            {seat.cards.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {seat.cards.map((card) => (
                  <TapeFace key={card.id} card={card} />
                ))}
              </div>
            )}
            {seat.melds.map((meld, meldIndex) => (
              <div key={`${seat.name}-meld-${meldIndex}`} className="mt-2 flex flex-wrap gap-1">
                {meld.map((card) => (
                  <TapeFace key={card.id} card={card} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="min-h-6 text-center text-sm text-muted">{view.title}</p>
    </div>
  );
}

function TapeFace({ card }: { card: TapeCard }) {
  if (card.down || card.rank < 2) return <PlayingCard down size="sm" />;
  return <PlayingCard card={{ id: card.id, rank: card.rank as Rank, suit: card.suit as Suit }} size="sm" />;
}
