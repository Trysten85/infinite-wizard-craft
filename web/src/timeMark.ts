// How the evening's time is shown to the player: the one place it is written (the Candle Gate
// rule in Process.md). Change the mark here and every line the page says changes with it. The
// page draws it as the hourglass sprite wherever it reads it (`Said` in icons.tsx).
export const TIME_MARK = "⌛";

// An amount of time in a sentence: "2 ⌛".
export const timeAmount = (amount: number) => `${amount} ${TIME_MARK}`;
