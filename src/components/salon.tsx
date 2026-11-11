import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ScrollText } from "lucide-react";
import { Btn, RulesSheet } from "@/components/bits";
import { BlackjackTable } from "@/components/games/blackjack-table";
import { ChineseTable } from "@/components/games/chinese-table";
import { HoldemTable } from "@/components/games/holdem-table";
import { TongitsTable } from "@/components/games/tongits-table";
import { BUY_IN, MIN_BUY, SEAT_KEY, useWallet, type GameId } from "@/lib/wallet";

const TABLES: { id: GameId; name: string; mark: string; line: string }[] = [
  { id: "holdem", name: "Hold'em", mark: "♠", line: "No-limit. Three seats. Blinds 10 and 20." },
  { id: "blackjack", name: "Blackjack", mark: "♥", line: "Four decks. Dealer stands on every 17." },
  { id: "tongits", name: "Tong-its", mark: "♣", line: "Melds, lay-offs, and a fight for the low count." },
  { id: "chinese", name: "Chinese poker", mark: "♦", line: "Thirteen cards across back, middle, and front." },
];

export function Salon() {
  const { chips, setChips, ready } = useWallet();
  const [seat, setSeat] = useState<{ game: GameId; stack: number } | null>(null);
  const [rules, setRules] = useState<GameId | "house" | null>(null);
  const [short, setShort] = useState(false);
  const seated = useRef(false);

  useEffect(() => {
    if (!ready) return;
    try {
      const raw = localStorage.getItem(SEAT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { game?: GameId; stack?: number };
      if (!parsed.game || !BUY_IN[parsed.game] || typeof parsed.stack !== "number") return;
      seated.current = true;
      setSeat({ game: parsed.game, stack: Math.max(0, Math.floor(parsed.stack)) });
    } catch {
      /* start in the lobby */
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || !seat) return;
    localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  }, [ready, seat]);

  const remember = useCallback((stack: number) => {
    setSeat((current) => {
      if (!current || current.stack === stack) return current;
      return { ...current, stack };
    });
  }, []);

  function sit(game: GameId) {
    if (!ready || seated.current) return;
    if (chips < MIN_BUY[game]) {
      setShort(true);
      return;
    }
    const buy = Math.min(BUY_IN[game], chips);
    seated.current = true;
    setChips((cage) => cage - buy);
    setShort(false);
    setSeat({ game, stack: buy });
  }

  function leave(stack: number) {
    if (!seated.current) return;
    seated.current = false;
    localStorage.removeItem(SEAT_KEY);
    setChips((cage) => cage + stack);
    setSeat(null);
  }

  function fund(request: number): number {
    let cage = chips;
    if (cage < request) cage += 500;
    const moved = Math.min(request, cage);
    setChips(cage - moved);
    return moved;
  }

  return (
    <main className="room min-h-dvh text-cream">
      {seat ? (
        <GameSeat
          game={seat.game}
          stack={seat.stack}
          cage={chips}
          onLeave={leave}
          onFund={fund}
          onStack={remember}
          onRules={() => setRules(seat.game)}
        />
      ) : (
        <Lobby chips={chips} ready={ready} short={short} onSit={sit} onRules={() => setRules("house")} onComp={() => setChips((cage) => cage + 500)} />
      )}
      {rules && (
        <RulesSheet title={rules === "house" ? "House rules" : TABLES.find((table) => table.id === rules)?.name ?? "Rules"} onClose={() => setRules(null)}>
          <RuleBody id={rules} />
        </RulesSheet>
      )}
    </main>
  );
}

function Lobby({
  chips,
  ready,
  short,
  onSit,
  onRules,
  onComp,
}: {
  chips: number;
  ready: boolean;
  short: boolean;
  onSit: (game: GameId) => void;
  onRules: () => void;
  onComp: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gold">Four tables</p>
          <h1 className="font-display text-5xl text-cream sm:text-6xl">Jade Felt</h1>
          <p className="mt-2 max-w-md text-muted">A private room. Play money, honest shoes, and regulars who do not blink.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted">Cage</p>
          <p className="font-display text-3xl tabular-nums text-gold">{ready ? chips : "—"}</p>
        </div>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {TABLES.map((table) => (
          <button
            key={table.id}
            type="button"
            disabled={!ready}
            onClick={() => onSit(table.id)}
            className="flex min-h-40 flex-col justify-between rounded-3xl border border-line bg-rail p-5 text-left transition-colors duration-200 hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50"
          >
            <span className="font-display text-4xl text-gold" aria-hidden>
              {table.mark}
            </span>
            <span>
              <span className="block font-display text-3xl text-cream">{table.name}</span>
              <span className="mt-1 block text-sm text-muted">{table.line}</span>
              <span className="mt-3 block text-sm text-gold">Sit down · {BUY_IN[table.id]}</span>
            </span>
          </button>
        ))}
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Buy-ins come out of the cage and go back when you cash out.</p>
        <div className="flex flex-wrap gap-2">
          {(short || chips < 100) && ready && (
            <Btn tone="gold" onClick={onComp}>
              House comp 500
            </Btn>
          )}
          <Btn onClick={onRules}>
            <BookOpen className="size-4" aria-hidden />
            Rules
          </Btn>
          <Link
            to="/admin"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-transparent px-4 text-sm font-medium text-cream transition-colors duration-200 hover:bg-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <ScrollText className="size-4" aria-hidden />
            House book
          </Link>
        </div>
      </footer>
    </div>
  );
}

function GameSeat({
  game,
  stack,
  cage,
  onLeave,
  onFund,
  onStack,
  onRules,
}: {
  game: GameId;
  stack: number;
  cage: number;
  onLeave: (stack: number) => void;
  onFund: (amount: number) => number;
  onStack: (stack: number) => void;
  onRules: () => void;
}) {
  if (game === "holdem") return <HoldemTable stack={stack} cage={cage} onLeave={onLeave} onFund={onFund} onStack={onStack} onRules={onRules} />;
  if (game === "blackjack") return <BlackjackTable stack={stack} cage={cage} onLeave={onLeave} onFund={onFund} onStack={onStack} onRules={onRules} />;
  if (game === "tongits") return <TongitsTable stack={stack} cage={cage} onLeave={onLeave} onFund={onFund} onStack={onStack} onRules={onRules} />;
  return <ChineseTable stack={stack} cage={cage} onLeave={onLeave} onFund={onFund} onStack={onStack} onRules={onRules} />;
}

function RuleBody({ id }: { id: GameId | "house" }) {
  if (id === "holdem") {
    return (
      <>
        <p>No-limit Hold'em, three handed. Blinds are 10 and 20. Mina plays tight. Rafa does not.</p>
        <p>You get two hole cards. Five community cards follow. Your best five-card hand wins the pot. A short all-in reopens the betting.</p>
        <p>Fold, call, or raise. The pot button sizes a pot-sized raise. Odd chips go to the first winner left of the button.</p>
      </>
    );
  }
  if (id === "blackjack") {
    return (
      <>
        <p>Four-deck shoe. Dealer stands on every 17, including soft 17. Blackjack pays 3 to 2, rounded down.</p>
        <p>Double on any first two cards, including after a split. You may split once, and only a true pair. Split aces each receive one card. A 21 after a split is not a blackjack.</p>
        <p>Insurance is offered when the dealer shows an ace, for half your bet, and pays 2 to 1.</p>
      </>
    );
  }
  if (id === "tongits") {
    return (
      <>
        <p>Three players, one deck. The dealer gets 13 cards and discards first. Everyone else gets 12. Ante is 20.</p>
        <p>A meld is three or four of a kind, or a same-suit run of three or more. Aces are low. Queen-king-ace is not a run.</p>
        <p>On your turn, draw from the stock or take the discard by laying a meld that uses it at once. Then you may drop melds and lay a card onto any meld on the table. Discard one card to end the turn.</p>
        <p>Secret melds in your hand score nothing at the end, but you must have dropped at least one meld or you are burned and cannot win. Aces are 1, tens and faces are 10, and the rest are face value. Lower is better.</p>
        <p>Empty your hand to call Tong-its and take 20 more from each player. Or, before you draw, call a fight if you have a drop and nobody has laid off on you since your last turn. You need the strictly lowest count.</p>
      </>
    );
  }
  if (id === "chinese") {
    return (
      <>
        <p>Each player gets 13 cards and sets three rows: back (5), middle (5), and front (3). Back must rank strictly above middle, and middle strictly above front. Anything else is a foul.</p>
        <p>The front only counts trips, a pair, or high card. Flushes and straights in front are ignored.</p>
        <p>Against each opponent you win 1 unit per row. Sweeping all three is worth 4. A foul pays 4 and collects no royalties, and it pays the opponent's royalties.</p>
        <p>Royalties, in units from each opponent: trips in front 3, full house in the middle 2, four of a kind in the middle 4, straight flush in the middle 5, four of a kind in the back 4, straight flush in the back 5. Each unit is 20 chips.</p>
      </>
    );
  }
  return (
    <>
      <p>Pick a table. The buy-in leaves the cage and returns when you cash out, even mid-hand. Chips in a live pot stay in the pot.</p>
      <p>The cage remembers your chips on this device. If you go broke, the house will comp you 500.</p>
      <p>Open a table's rules once you're seated. The regulars are Mina, Rafa, Liza, Nico, Wen, and Paolo.</p>
    </>
  );
}
