// A coin and an amount. `label` adds the word for places where the number alone would be unclear.
export function Gold({ amount, label = false, prefix = "" }: { amount: number; label?: boolean; prefix?: string }) {
  return (
    <span className="gold">
      <span className="coin" aria-hidden="true" />
      {prefix}
      {amount}
      {label ? " gold" : <span className="sr-only"> gold</span>}
    </span>
  );
}
