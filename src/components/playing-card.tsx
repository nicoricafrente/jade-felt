import { cardName, isRed, rankLabel, suitSymbol, type Card } from "@/lib/cards/model";
import { cn } from "@/lib/cn";

const SIZE = {
  sm: "h-16 w-11 rounded-md text-xs",
  md: "h-24 w-16 rounded-lg text-sm",
  lg: "h-28 w-20 rounded-lg text-base",
} as const;

export function PlayingCard({
  card,
  down = false,
  selected = false,
  dim = false,
  size = "md",
  onClick,
  label,
}: {
  card?: Card;
  down?: boolean;
  selected?: boolean;
  dim?: boolean;
  size?: keyof typeof SIZE;
  onClick?: () => void;
  label?: string;
}) {
  const className = cn(
    "relative inline-flex shrink-0 items-center justify-center border shadow-md transition-transform duration-150",
    SIZE[size],
    down ? "card-back border-gold" : "border-cream-dim bg-cream",
    selected && "-translate-y-2 ring-2 ring-gold",
    dim && "opacity-45",
    onClick && "hover:-translate-y-1",
  );
  const name = down ? "Face-down card" : card ? cardName(card) : "Empty card";
  const body =
    down || !card ? null : (
      <>
        <span
          className={cn(
            "absolute left-1 top-0.5 text-left font-display leading-none",
            isRed(card.suit) ? "text-suit" : "text-ink",
          )}
        >
          {rankLabel(card.rank)}
          <span className="block text-center">{suitSymbol(card.suit)}</span>
        </span>
        {size !== "sm" && (
          <span className={cn("font-display text-3xl", isRed(card.suit) ? "text-suit" : "text-ink")}>
            {suitSymbol(card.suit)}
          </span>
        )}
      </>
    );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={selected} aria-label={label ?? name}>
        {body}
      </button>
    );
  }
  return (
    <div className={className} aria-label={label ?? name}>
      {body}
    </div>
  );
}

export function CardRow({
  cards,
  size = "md",
  overlap = true,
  selected,
  onToggle,
  dimIds,
}: {
  cards: Card[];
  size?: keyof typeof SIZE;
  overlap?: boolean;
  selected?: ReadonlySet<string>;
  onToggle?: (card: Card) => void;
  dimIds?: ReadonlySet<string>;
}) {
  return (
    <div className="flex max-w-full justify-center overflow-x-auto px-1 py-2">
      <div className="flex w-max">
        {cards.map((card, index) => (
          <div
            key={card.id}
            className={cn(overlap && index > 0 && "-ml-4")}
            style={{ zIndex: selected?.has(card.id) ? 40 : index }}
          >
            <PlayingCard
              card={card}
              size={size}
              selected={selected?.has(card.id)}
              dim={dimIds?.has(card.id)}
              onClick={onToggle ? () => onToggle(card) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
