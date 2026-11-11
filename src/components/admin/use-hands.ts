import { useEffect, useState } from "react";
import { listHands } from "@/lib/house-book.functions";
import type { BookedHand } from "@/lib/ledger";

export function useBookedHands() {
  const [hands, setHands] = useState<BookedHand[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    listHands()
      .then((rows) => {
        if (gone) return;
        setHands(rows);
        setReady(true);
      })
      .catch(() => {
        if (gone) return;
        setError("The book didn't open. Finish a hand, then come back.");
        setReady(true);
      });
    return () => {
      gone = true;
    };
  }, []);

  return { hands, ready, error };
}
