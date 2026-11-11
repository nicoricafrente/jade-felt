import { useEffect, useState } from "react";

const KEY = "jade-felt-chips";
export const SEAT_KEY = "jade-felt-seat";

export function useWallet() {
  const [chips, setChips] = useState(2000);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw != null) {
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0) setChips(Math.floor(value));
      }
    } catch {
      /* keep the house stake */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(KEY, String(chips));
  }, [chips, ready]);

  return { chips, setChips, ready };
}

export type GameId = "holdem" | "blackjack" | "tongits" | "chinese";

export const BUY_IN: Record<GameId, number> = {
  holdem: 500,
  blackjack: 400,
  tongits: 300,
  chinese: 400,
};

export const MIN_BUY: Record<GameId, number> = {
  holdem: 100,
  blackjack: 20,
  tongits: 60,
  chinese: 100,
};
