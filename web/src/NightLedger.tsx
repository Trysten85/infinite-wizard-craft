import { useEffect, useRef } from "react";
import type { Ledger } from "../../src/shared/schema";
import { qualityName, takingsTotal } from "./day";
import { Gold } from "./Gold";

type Props = {
  ledger: Ledger;
  // True when night has just fallen, and false when last night's ledger is being read again.
  fresh: boolean;
  onClose: () => void;
};

// The night ledger: what the day came to, shown once when night falls and again whenever the
// player asks for it. It lists only what happened, so a night with no town yet is short.
export function NightLedger({ ledger, fresh, onClose }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Takes focus once, when the card comes up, so Escape and Tab start from it.
  useEffect(() => {
    card.current?.focus();
    const onKeyDown = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="event-backdrop night">
      <div className="event-card night-ledger" role="dialog" aria-modal="true" aria-labelledby="ledger-title" tabIndex={-1} ref={card}>
        <header className="event-head">
          <h2 id="ledger-title">{fresh ? "Night falls" : "Last night"}</h2>
          <p>The ledger for day {ledger.day}</p>
        </header>

        {ledger.takings.length > 0 && (
          <>
            <h3 className="order-step">Takings</h3>
            <table className="ledger-takings">
              <tbody>
                {ledger.takings.map((row) => (
                  <tr key={row.plot}>
                    <th scope="row">{row.name}</th>
                    <td>{qualityName(row.quality)}</td>
                    <td>
                      <Gold amount={row.gold} prefix="+" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Tonight</th>
                  <td>{ledger.cheer && `${ledger.cheer.band} · cheer ${ledger.cheer.points}`}</td>
                  <td>
                    <Gold amount={takingsTotal(ledger)} prefix="+" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <ul className="ledger-lines">
          {ledger.brought.map((item, index) => (
            <li key={`brought-${index}`} className={item.kind}>
              {item.line}
            </li>
          ))}
          {ledger.missed && <li className="missed">{ledger.missed}</li>}
          {ledger.deed && <li className="deed">A new level, and with it a deed: you may own another plot.</li>}
          {ledger.lines.map((line, index) => (
            <li key={`line-${index}`}>{line}</li>
          ))}
        </ul>

        <button className="event-done" onClick={onClose}>
          {fresh ? "Good morning" : "Close"}
        </button>
      </div>
    </div>
  );
}
