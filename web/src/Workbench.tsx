import { useEffect, useRef, useState } from "react";
import type {
  EventView,
  GameEntry,
  Ledger,
  PlayerProgress,
  ResponseType,
  ShiftBoard,
  ShiftResult,
  ShopSlot,
  ShopView,
  TownView,
} from "../../src/shared/schema";
import {
  ApiError,
  buy,
  buyPlot,
  callOn,
  chooseJob,
  combine,
  endDay,
  fetchEvent,
  fetchPlayer,
  fetchShift,
  fetchShop,
  enchantBuilding,
  fetchTown,
  haveMeal,
  learn,
  lendHand,
  raiseBuilding,
  stockShelf,
  takeTonight,
  respondToEvent,
  testEvent,
  upgradeBuilding,
  workShift,
  type Earned,
} from "./api";
import { Board, type BubbleEffect } from "./Board";
import { tonightNews, visitorCue } from "./day";
import { visitorPlace } from "./town";
import { besideTarget, clampToBoard, newBubbleId, parseBoard, spawnPoint, type Bubble, type Size } from "./bubbles";
import { EntryBubble } from "./EntryBubble";
import { EventCard, type EventEnding } from "./EventCard";
import { Gold } from "./Gold";
import { NightLedger } from "./NightLedger";
import { OrderBoard, type ShiftChoice } from "./OrderBoard";
import { Organizer } from "./Organizer";
import { parseOrganize, serializeOrganize } from "./organize";
import { QuestTracker } from "./QuestTracker";
import { Shop } from "./Shop";
import { Spellbook } from "./Spellbook";
import { learnNote } from "./spells";
import { StatusBar } from "./StatusBar";
import { Town } from "./Town";
import { useBubbleDrag, type Drop } from "./useBubbleDrag";
import { usePageTurn } from "./usePageTurn";

const ORGANIZE_KEY = "iwc-organize";
// How far a dropped bubble sits off the one it is merging with, so both stay visible.
const MERGE_OFFSET = 10;
const DUPLICATE_OFFSET = 16;
const RETRY_MS = 3000;
// How often to ask after an event that has been earned and is still being written.
const EVENT_POLL_MS = 5000;
// Where a player stands before the server has answered.
const NO_PROGRESS: PlayerProgress = {
  xp: 0,
  level: 1,
  levelInto: 0,
  levelSpan: 1,
  gold: 0,
  learned: [],
  quests: [],
  rep: 0,
  repBand: "",
  requests: [],
  eventReady: false,
  eventIn: 0,
};

type Tab = "discovered" | "shop";
// Places a dragged bubble can be handed over, besides the board: the book of discoveries takes
// anything back, the job cell takes a job, and the spellbook takes a spell to be learned.
// A shelf in the town is a zone too, named "slot:plot:shelf".
type Zone = "book" | "job" | "spellbook" | `slot:${number}:${number}` | `plot:${number}`;

// A short message that fades on its own. `gold` is what was gained, or lost when negative.
type Toast = {
  id: string;
  label: string;
  name: string;
  gold?: number;
  xp?: number;
};

function sizeOf(element: HTMLElement | undefined): Size {
  return {
    width: element?.offsetWidth ?? 0,
    height: element?.offsetHeight ?? 0,
  };
}

export function Workbench({ player, onLeave }: { player: string; onLeave: () => void }) {
  // Discovered entries, oldest first.
  const [entries, setEntries] = useState<GameEntry[]>([]);
  // Gold, level, quests and learned spells. The server owns all of it and sends it back whole.
  const [progress, setProgress] = useState(NO_PROGRESS);
  // Null until the shop's stock has loaded.
  const [shop, setShop] = useState<ShopView | null>(null);
  const [buying, setBuying] = useState<number | null>(null);
  // The event the player has been shown, and whether its card is up. An event is a short
  // conversation, so `event` moves on to its next part as the player answers.
  const [event, setEvent] = useState<EventView | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  // What the player's last reaction changed, while the conversation is still going.
  const [reaction, setReaction] = useState<EventEnding["effects"] | null>(null);
  // How the conversation ended, once it has.
  const [ending, setEnding] = useState<EventEnding | null>(null);
  // What the page is waiting on the server for, to do with events.
  const [eventBusy, setEventBusy] = useState<"" | "fetching" | "testing" | "responding">("");
  // The order board for the player's job: what the server last said is on it, why it couldn't
  // say, whether the board is up, how the last order went, and whether one is being filled.
  const [shift, setShift] = useState<ShiftBoard | null>(null);
  const [shiftProblem, setShiftProblem] = useState("");
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [shiftResult, setShiftResult] = useState<ShiftResult | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  // The night ledger on show: the one night just brought, or last night's, asked for again.
  const [ledger, setLedger] = useState<{ page: Ledger; fresh: boolean } | null>(null);
  const [dayBusy, setDayBusy] = useState(false);
  // Which of the two the board's space is showing: the workbench, or the town's street.
  const [place, setPlace] = useState<"bench" | "town">("bench");
  // The street as the server last gave it, why it couldn't, and whether something is being raised.
  const [town, setTown] = useState<TownView | null>(null);
  const [townProblem, setTownProblem] = useState("");
  const [townBusy, setTownBusy] = useState(false);
  // Who has been called on this evening, kept by day so a new day starts clean. The server is the
  // one that refuses a second call, and this only keeps the button honest in between.
  const [called, setCalled] = useState<{ day: number; people: number[] }>({ day: 0, people: [] });
  // The shop is shut until a Market Stall stands. A server from before the town never says so.
  const [shopShut, setShopShut] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  // False until the saved board has been read, so the empty first render never overwrites it.
  const [loaded, setLoaded] = useState(false);
  // Ids of bubbles waiting on a combine request. They can't be moved or removed.
  const [merging, setMerging] = useState<ReadonlySet<string>>(new Set());
  const [effects, setEffects] = useState<Record<string, BubbleEffect>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [organize, setOrganize] = useState(() => parseOrganize(localStorage.getItem(ORGANIZE_KEY)));
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("discovered");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const boardRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const jobRef = useRef<HTMLDivElement>(null);
  const spellbookRef = useRef<HTMLButtonElement>(null);
  // The shelf a stocked thing is being carried from, so letting it go over the book clears it.
  const fromShelf = useRef<{ plot: number; slot: number } | null>(null);
  // Whether the player had a focus at the last look. Null until the first load, so a focus they
  // already had isn't greeted as new.
  const hadFocus = useRef<boolean | null>(null);
  // True once the focus has been made during this visit, so the spellbook arrives with a flourish.
  const [focusIsNew, setFocusIsNew] = useState(false);
  // True while something is being tried with the focus, which can take the model a while.
  const [bookBusy, setBookBusy] = useState(false);
  const bubbleEls = useRef(new Map<string, HTMLElement>());
  const spawned = useRef(0);
  // The day tonight's happening was last announced for, so it is told once a day and not on every
  // re-render. A ref lives as long as the page is open, so reloading tells it again.
  const announced = useRef<number | null>(null);
  const pages = usePageTurn();
  // The level last shown, kept outside state so that requests finishing out of order agree on it.
  const shownLevel = useRef(1);
  // The day and the time of day last shown, kept the same way, so each noon and dusk is said once.
  const shownDay = useRef<{ number: number; phase: string } | null>(null);
  const boardKey = `iwc-board:${player}`;

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const learnedSpells = progress.learned.flatMap((id) => byId.get(id) ?? []);

  // Keeps trying until the first load works, so the list fills in once the server is back.
  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function load() {
      fetchPlayer(player)
        .then((found) => {
          if (stopped) return;
          setEntries(found.entries);
          setProgress(found.progress);
          shownLevel.current = found.progress.level;
          shownDay.current = found.progress.day ? { number: found.progress.day.number, phase: found.progress.day.phase } : null;
          // A focus saved on a board from before it became the corner spellbook is left off.
          const loose = found.entries.filter((entry) => entry.kind !== "focus");
          setBubbles(parseBoard(localStorage.getItem(boardKey), new Set(loose.map((entry) => entry.id))));
          setLoaded(true);
          setLoadError("");
          restock();
          readShift();
        })
        .catch((err: Error) => {
          if (stopped) return;
          setLoadError(err.message);
          retry = setTimeout(load, RETRY_MS);
        });
    }

    load();
    return () => {
      stopped = true;
      clearTimeout(retry);
    };
  }, [player, boardKey]);

  useEffect(() => {
    if (loaded) localStorage.setItem(boardKey, JSON.stringify(bubbles));
  }, [loaded, bubbles, boardKey]);

  useEffect(() => {
    localStorage.setItem(ORGANIZE_KEY, serializeOrganize(organize));
  }, [organize]);

  // Reads the shelf again. It changes when the player discovers things: stock turns over, and
  // anything they have since made for themselves is marked sold.
  function restock() {
    fetchShop(player)
      .then((shelf) => {
        setShop(shelf);
        setShopShut(false);
      })
      .catch((err: Error) => {
        // No stall, no shop. That is how things stand, not something gone wrong.
        if (err instanceof ApiError && err.code === "no-shop") {
          setShopShut(true);
          setTab("discovered");
        } else setError(err.message);
      });
  }

  // Takes in the player's new standing after an action, and announces what the action earned.
  function earn({ rewards, progress: next, night, dusk }: Earned) {
    const fresh: Toast[] = rewards.quests.map((quest) => ({
      id: `quest-${quest.id}`,
      label: "Quest complete:",
      name: quest.title,
      gold: quest.gold,
      xp: quest.xp,
    }));
    if (next.level > shownLevel.current)
      fresh.push({
        id: `level-${next.level}`,
        label: "Level up:",
        name: `Level ${next.level}`,
      });
    shownLevel.current = next.level;
    // Noon and dusk, as the sun reaches them. A new day says so with its ledger instead.
    const was = shownDay.current;
    if (next.day && was && was.number === next.day.number && was.phase !== next.day.phase) {
      if (next.day.phase === "afternoon")
        fresh.push({
          id: `noon-${next.day.number}`,
          label: "Noon:",
          name: next.shiftReady ? "orders are on the board" : "half the day is gone",
        });
      if (next.day.phase === "evening")
        fresh.push({
          id: `dusk-${next.day.number}`,
          // The server's own line for the evening coming on, when it sends one.
          label: dusk ?? "Dusk:",
          name: `${next.day.time} ⌛ to spend this evening`,
        });
    }
    shownDay.current = next.day ? { number: next.day.number, phase: next.day.phase } : null;
    setProgress(next);
    if (fresh.length > 0) setToasts((current) => [...current, ...fresh]);
    if (night) {
      // Morning comes with the ledger: the shop has new stock, and yesterday's orders are gone.
      setLedger({ page: night, fresh: true });
      restock();
      readShift();
      if (place === "town") readTown();
    }
  }

  // Goes to bed, or calls it a day before dusk. The server decides which, and what follows.
  async function goToBed() {
    setDayBusy(true);
    setError("");
    try {
      earn(await endDay(player));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDayBusy(false);
    }
  }

  function boardSize(): Size {
    return {
      width: boardRef.current?.clientWidth ?? 0,
      height: boardRef.current?.clientHeight ?? 0,
    };
  }

  // Pulls back any bubble that hangs off the board: after a resize, a restore, or a wide result.
  function keepOnBoard() {
    const board = boardSize();
    setBubbles((current) => {
      let moved = false;
      const next = current.map((bubble) => {
        const element = bubbleEls.current.get(bubble.id);
        if (!element) return bubble;
        const spot = clampToBoard(bubble.x, bubble.y, sizeOf(element), board);
        if (spot.x === bubble.x && spot.y === bubble.y) return bubble;
        moved = true;
        return { ...bubble, ...spot };
      });
      return moved ? next : current;
    });
  }

  useEffect(keepOnBoard, [bubbles]);

  useEffect(() => {
    const observer = new ResizeObserver(keepOnBoard);
    if (boardRef.current) observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, []);

  function addBubble(bubble: Bubble, effect?: BubbleEffect) {
    setBubbles((current) => [...current, bubble]);
    if (effect) setEffects((current) => ({ ...current, [bubble.id]: effect }));
  }

  function removeBubble(id: string) {
    setBubbles((current) => current.filter((bubble) => bubble.id !== id));
    endEffect(id);
  }

  function endEffect(id: string) {
    setEffects(({ [id]: _ended, ...rest }) => rest);
  }

  function spawn(entry: GameEntry) {
    // The board is out of sight in the town, so a click there only reads the entry.
    if (place === "town") return setSelectedId(entry.id);
    addBubble(
      {
        id: newBubbleId(),
        entryId: entry.id,
        ...spawnPoint(boardSize(), spawned.current++),
      },
      "pop",
    );
    setSelectedId(entry.id);
  }

  function duplicate(bubble: Bubble) {
    const copy = {
      ...bubble,
      id: newBubbleId(),
      x: bubble.x + DUPLICATE_OFFSET,
      y: bubble.y + DUPLICATE_OFFSET,
    };
    addBubble(copy, "pop");
  }

  function clearBoard() {
    setBubbles((current) => current.filter((bubble) => merging.has(bubble.id)));
    setEffects({});
  }

  function handleDrop(drop: Drop<Zone>) {
    // Where a stocked thing was picked up from, if it was, which only this drop may use.
    const shelf = fromShelf.current;
    fromShelf.current = null;
    const held = byId.get(drop.entryId);
    // The spellbook learns a spell, and tries anything else as a combination with the focus.
    // Either way the bubble stays where it was unless the book takes it.
    if (drop.zone === "spellbook") {
      if (held?.kind === "spell") void learnAtBook(held, drop.bubbleId);
      else if (held) void combineAtBook(held, drop.bubbleId);
      return;
    }
    // A shelf takes what is dropped on it. A thing taken off a shelf and let go over the book is
    // put away, and let go anywhere else it stays where it was.
    if (drop.zone?.startsWith("plot:")) {
      const plot = Number(drop.zone.slice(5));
      const spell = byId.get(drop.entryId);
      if (spell?.kind === "spell") void cast(plot, spell);
      return;
    }
    if (drop.zone?.startsWith("slot:")) {
      const [, plot, slot] = drop.zone.split(":").map(Number);
      void build(() => stockShelf(player, plot!, slot!, drop.entryId));
      return;
    }
    if (place === "town" && drop.zone === "book" && shelf) {
      void build(() => stockShelf(player, shelf.plot, shelf.slot, null));
      return;
    }
    // Otherwise the bubble has been handed over, so it leaves the board.
    if (drop.zone) {
      if (drop.bubbleId) removeBubble(drop.bubbleId);
      if (drop.zone === "job" && held) void takeJob(held);
      return;
    }
    // The street takes nothing yet, so a thing let go over it goes back where it came from.
    if (place === "town") return;
    const target = bubbles.find((bubble) => bubble.id === drop.targetId);
    const board = boardRef.current!.getBoundingClientRect();
    const spot = target
      ? { x: target.x + MERGE_OFFSET, y: target.y + MERGE_OFFSET }
      : clampToBoard(drop.left - board.left, drop.top - board.top, drop.size, board);
    const dropped = {
      id: drop.bubbleId ?? newBubbleId(),
      entryId: drop.entryId,
      ...spot,
    };

    // Re-adding it at the end also brings it to the front.
    setBubbles((current) => [...current.filter((bubble) => bubble.id !== dropped.id), dropped]);
    setSelectedId(drop.entryId);
    if (!target) return;

    void merge(dropped, target);
  }

  // Puts two bubbles that wouldn't go together side by side again, and says why.
  function bounce(dropped: Bubble, target: Bubble, reason: string) {
    setError(reason);
    const els = bubbleEls.current;
    const aside = besideTarget(target, sizeOf(els.get(target.id)), sizeOf(els.get(dropped.id)), boardSize());
    setBubbles((current) => current.map((bubble) => (bubble.id === dropped.id ? { ...bubble, ...aside } : bubble)));
    setEffects((current) => ({
      ...current,
      [dropped.id]: "shake",
      [target.id]: "shake",
    }));
  }

  async function merge(dropped: Bubble, target: Bubble) {
    const pair = [dropped.id, target.id];
    setMerging((current) => new Set([...current, ...pair]));
    setError("");
    try {
      const { entry, firstDiscovery, ...earned } = await combine(player, dropped.entryId, target.entryId);
      const result = {
        id: newBubbleId(),
        entryId: entry.id,
        x: target.x,
        y: target.y,
      };
      earn(earned);
      if (firstDiscovery) restock();
      setEntries((current) => (current.some((known) => known.id === entry.id) ? current : [...current, entry]));
      // A focus is never a bubble: making one brings the spellbook to its corner.
      const made = entry.kind === "focus" ? [] : [result];
      setBubbles((current) => [...current.filter((bubble) => !pair.includes(bubble.id)), ...made]);
      setEffects((current) => ({
        ...current,
        [result.id]: firstDiscovery ? "new" : "pop",
      }));
      if (entry.kind !== "focus") setSelectedId(entry.id);
    } catch (err) {
      bounce(dropped, target, err instanceof Error ? err.message : String(err));
    } finally {
      setMerging((current) => new Set([...current].filter((id) => !pair.includes(id))));
    }
  }

  // Learns a spell let go on the spellbook. If the server refuses, a spell that was on the board
  // simply stays where it was.
  async function learnAtBook(spell: GameEntry, bubbleId: string | null) {
    setError("");
    try {
      const { cost, ...earned } = await learn(player, spell.id);
      if (bubbleId) removeBubble(bubbleId);
      setToasts((current) => [
        ...current,
        {
          id: `learn-${spell.id}`,
          label: "Learned:",
          name: spell.name,
          gold: -cost,
        },
      ]);
      setSelectedId(spell.id);
      earn(earned);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Tries something with the focus, the way two bubbles are tried with each other. What comes of
  // it lands on the board beside the spellbook. If nothing does, a bubble that was on the board
  // stays where it was.
  async function combineAtBook(held: GameEntry, bubbleId: string | null) {
    if (!focus) return;
    if (bubbleId) setMerging((current) => new Set([...current, bubbleId]));
    setBookBusy(true);
    setError("");
    try {
      const { entry, firstDiscovery, ...earned } = await combine(player, held.id, focus.id);
      earn(earned);
      if (firstDiscovery) restock();
      setEntries((current) => (current.some((known) => known.id === entry.id) ? current : [...current, entry]));
      const board = boardRef.current!.getBoundingClientRect();
      const book = spellbookRef.current!.getBoundingClientRect();
      const result = {
        id: newBubbleId(),
        entryId: entry.id,
        x: book.right - board.left + 12,
        y: book.top - board.top + book.height / 3,
      };
      setBubbles((current) => [...current.filter((bubble) => bubble.id !== bubbleId), ...(entry.kind === "focus" ? [] : [result])]);
      setEffects((current) => ({
        ...current,
        [result.id]: firstDiscovery ? "new" : "pop",
      }));
      if (entry.kind !== "focus") setSelectedId(entry.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBookBusy(false);
      if (bubbleId) setMerging((current) => new Set([...current].filter((id) => id !== bubbleId)));
    }
  }

  // Buying is a shortcut to something the player hasn't made. It lands on the board, ready to use.
  async function buyFromShop(slot: ShopSlot) {
    setBuying(slot.slot);
    setError("");
    try {
      const { entry, shop: shelf, ...earned } = await buy(player, slot.slot);
      setEntries((current) => (current.some((known) => known.id === entry.id) ? current : [...current, entry]));
      setShop(shelf);
      addBubble(
        {
          id: newBubbleId(),
          entryId: entry.id,
          ...spawnPoint(boardSize(), spawned.current++),
        },
        "new",
      );
      setToasts((current) => [
        ...current,
        {
          id: `buy-${entry.id}`,
          label: "Bought:",
          name: entry.name,
          gold: -slot.price,
        },
      ]);
      setSelectedId(entry.id);
      earn(earned);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuying(null);
    }
  }

  // Brings up an event: the one waiting on the player, or for testing a fresh one written now.
  // Writing takes the model a while, so the buttons that start this say so.
  async function showEvent(source: "waiting" | "test") {
    setEventBusy(source === "test" ? "testing" : "fetching");
    setError("");
    try {
      const found = source === "test" ? await testEvent(player) : await fetchEvent(player);
      if (!found.event) return;
      setEvent(found.event);
      setReaction(null);
      setEnding(null);
      setEventOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEventBusy("");
    }
  }

  async function respond(type: ResponseType) {
    if (!event) return;
    setEventBusy("responding");
    setError("");
    try {
      const { rewards, progress: standing, night, dusk, ...result } = await respondToEvent(player, type, event.beat);
      earn({ rewards, progress: standing, night, dusk });
      if (result.next) {
        // The conversation goes on. Its next part carries everything said so far.
        setEvent(result.next);
        setReaction(result.effects);
        return;
      }
      setEnding({
        ...result,
        chosen: event.responses.find((response) => response.type === type)?.text ?? "",
      });
      if (result.gift) void receive(result.gift.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEventBusy("");
    }
  }

  // A gift is an entry the player now has without having made it. The server only names it, so
  // the full entry comes from reading the player again. It lands on the board, ready to use.
  async function receive(entryId: string) {
    try {
      const found = await fetchPlayer(player);
      setEntries(found.entries);
      if (found.entries.some((entry) => entry.id === entryId && entry.kind !== "focus")) {
        addBubble(
          {
            id: newBubbleId(),
            entryId,
            ...spawnPoint(boardSize(), spawned.current++),
          },
          "new",
        );
      }
      restock();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // A finished conversation is over. An unfinished one stays waiting, and can be brought back up.
  function closeEvent() {
    setEventOpen(false);
    if (ending) {
      setEvent(null);
      setEnding(null);
    }
  }

  // Someone is waiting if the server has an event ready, or the player put one aside.
  const someoneWaiting = !eventOpen && (event !== null || progress.eventReady);
  // An event has been earned and the server is still writing it: none to go, and none ready.
  // Once the day is served a visitor is only seen from dusk, so before then there is no one to wait on.
  const day = progress.day;
  const someoneComing = loaded && event === null && !progress.eventReady && progress.eventIn === 0 && (!day || day.phase === "evening");
  // How a visitor the player hasn't met yet is offered. One already let in can be gone back to at any time.
  const seat = visitorPlace(event, town);
  const visitor = day && event === null ? visitorCue(day, seat) : null;

  // Tonight's happening is announced when it is first seen, so that missing it is a choice.
  useEffect(() => {
    if (!day) return;
    const news = tonightNews(day, announced.current);
    if (news === null) return;
    announced.current = day.number;
    tell("tonight-news", "Word is:", news);
  }, [day?.number, day?.tonight?.id, day?.tonight?.taken]);

  // The server only says an event is ready in answer to something, so a player sitting idle
  // would never hear. While one is on its way, ask now and then until it arrives.
  useEffect(() => {
    if (!someoneComing) return;
    const poll = setInterval(() => {
      fetchPlayer(player)
        .then((found) => setProgress(found.progress))
        .catch(() => {});
    }, EVENT_POLL_MS);
    return () => clearInterval(poll);
  }, [someoneComing, player]);

  // Reads the order board again. It changes with the player's job, with every discovery, and
  // with every order filled, and it is where their rank comes from.
  function readShift() {
    fetchShift(player)
      .then((board) => {
        setShift(board);
        setShiftProblem("");
      })
      .catch((err: Error) => {
        // A server from before shifts has no such route. That isn't worth a notice on the board.
        setShiftProblem(
          err instanceof ApiError && err.status === 404 ? "The order board isn't open yet. The server has no shifts to give." : err.message,
        );
      });
  }

  // Reads the street again. It changes when a plot is bought or a building raised, when a job is
  // discovered (its townsperson arrives), and overnight.
  function readTown() {
    fetchTown(player)
      .then((street) => {
        setTown(street);
        setTownProblem("");
      })
      .catch((err: Error) => {
        // A server from before the town has no such route.
        setTownProblem(
          err instanceof ApiError && err.status === 404 ? "The street is quiet. The server has no town to give yet." : err.message,
        );
      });
  }

  function visit(next: "bench" | "town") {
    setPlace(next);
    if (next === "town") readTown();
  }

  // Buys a plot or raises a building. The server decides whether it may be done, and the street
  // and the shop are read again afterwards: a Market Stall opens the shop.
  async function build(action: () => Promise<Earned>) {
    setTownBusy(true);
    setError("");
    try {
      earn(await action());
      readTown();
      restock();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTownBusy(false);
    }
  }

  // Says what an evening action came to, in the same place as everything else that is earned.
  function tell(id: string, label: string, name: string) {
    setToasts((current) => [...current.filter((toast) => toast.id !== id), { id, label, name }]);
  }

  async function callOnPerson(person: number) {
    setTownBusy(true);
    setError("");
    try {
      const { line, ...earned } = await callOn(player, person);
      setCalled((now) => ({ day: day?.number ?? 0, people: [...(now.day === (day?.number ?? 0) ? now.people : []), person] }));
      earn(earned);
      tell(`call-${person}`, "You call on them:", line);
      readTown();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTownBusy(false);
    }
  }

  async function haveAMeal() {
    setTownBusy(true);
    setError("");
    try {
      const { lift, cost, ...earned } = await haveMeal(player);
      earn(earned);
      tell("meal", "A meal at the Tavern:", `${cost} gold, and tomorrow's discoveries pay ${Math.round(lift * 100)}% more`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTownBusy(false);
    }
  }

  async function cast(plot: number, spell: GameEntry) {
    setTownBusy(true);
    setError("");
    try {
      const { days, ...earned } = await enchantBuilding(player, plot, spell.id);
      earn(earned);
      tell("enchant", `${spell.name} is cast:`, `it will last ${days} ${days === 1 ? "day" : "days"}`);
      readTown();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTownBusy(false);
    }
  }

  async function takePart() {
    setTownBusy(true);
    setError("");
    try {
      const { line, entry, price, ...earned } = await takeTonight(player);
      earn(earned);
      tell("tonight", "Tonight:", entry && price > 0 ? `${line} ${entry.name}, for ${price} gold.` : line);
      readTown();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTownBusy(false);
    }
  }

  function openOrders() {
    setShiftResult(null);
    setOrdersOpen(true);
    readShift();
  }

  // Fills an order with what the player chose. The server decides how it went.
  async function work(choice: ShiftChoice) {
    setShiftBusy(true);
    setError("");
    try {
      const { result, shift: board, ...earned } = await workShift(player, choice);
      setShift(board);
      setShiftResult(result);
      earn(earned);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setShiftBusy(false);
    }
  }

  // Tells the server what the player now works as. Its prompts, shop, and orders go by it.
  async function takeJob(job: GameEntry) {
    setError("");
    try {
      earn(await chooseJob(player, job.id));
      setToasts((current) => [...current.filter((toast) => toast.id !== "job"), { id: "job", label: "Now working as:", name: job.name }]);
      readShift();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const under = (element: HTMLElement | null, clientX: number, clientY: number) => {
    const box = element?.getBoundingClientRect();
    return !!box && clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
  };

  const drag = useBubbleDrag<Zone>({
    targets: (exceptId) =>
      bubbles.flatMap((bubble) => {
        const element = bubbleEls.current.get(bubble.id);
        if (!element || bubble.id === exceptId || merging.has(bubble.id)) return [];
        return [{ id: bubble.id, rect: element.getBoundingClientRect() }];
      }),
    // The job cell only takes jobs, and anything else let go over it lands on the board as usual.
    // The spellbook takes anything: a spell to learn, or something to try with the focus.
    zoneAt: (clientX, clientY, held) => {
      // In the town the shelves of the picked building are what can be dropped on.
      if (place === "town") {
        for (const shelf of document.querySelectorAll<HTMLElement>("[data-slot]")) {
          if (under(shelf, clientX, clientY)) return `slot:${shelf.dataset.slot}` as Zone;
        }
        // A learned spell dropped on a standing building is cast on it.
        if (byId.get(held.entryId)?.kind === "spell") {
          for (const plot of document.querySelectorAll<HTMLElement>("[data-plot]")) {
            if (under(plot, clientX, clientY)) return `plot:${plot.dataset.plot}` as Zone;
          }
        }
      }
      if (byId.get(held.entryId)?.kind === "job" && under(jobRef.current, clientX, clientY)) return "job";
      if (place === "bench" && under(spellbookRef.current, clientX, clientY)) return "spellbook";
      return under(panelRef.current, clientX, clientY) ? "book" : null;
    },
    onDrop: handleDrop,
  });

  const dragged = drag.source ? byId.get(drag.source.entryId) : undefined;

  // The spellbook stands on the board from the moment the player first holds a focus. The focus
  // is that book and nothing else: it is never a bubble, and it isn't listed with the discoveries.
  const focus = entries.find((entry) => entry.kind === "focus") ?? null;
  const loose = entries.filter((entry) => entry.kind !== "focus");
  useEffect(() => {
    if (!loaded) return;
    if (hadFocus.current === false && focus) {
      setFocusIsNew(true);
      setToasts((current) => [
        ...current,
        {
          id: "spellbook",
          label: "Your spellbook is open:",
          name: "drop spells on it to learn them",
        },
      ]);
    }
    hadFocus.current = focus !== null;
  }, [loaded, focus]);

  // The job the player has taken up, and their rank in it once the order board has been read.
  const job = (progress.job && byId.get(progress.job.id)) ?? null;
  const rank = shift?.job && shift.job.id === job?.id ? shift.rank : null;

  function openTab(next: Tab) {
    if (next !== tab) pages.turn(next === "shop" ? "forward" : "back", () => setTab(next));
  }

  return (
    <main className={`workbench ${day?.phase ?? ""}`}>
      <div className={`board-column ${place === "town" ? "in-town" : ""}`}>
        <header className="topbar">
          <h1>Infinite Wizard Craft</h1>
          <p>
            {player} · {loose.length} discovered · {/* For testing: has the server write an event now, without waiting to earn one. */}
            <button className="link" disabled={eventBusy !== ""} onClick={() => showEvent("test")}>
              {eventBusy === "testing" ? "writing an event…" : "test event"}
            </button>{" "}
            ·{" "}
            <button className="link" onClick={onLeave}>
              switch player
            </button>
          </p>
        </header>
        <Board
          boardRef={boardRef}
          bubbleEls={bubbleEls}
          bubbles={bubbles}
          byId={byId}
          merging={merging}
          effects={effects}
          liftedId={drag.source?.bubbleId ?? null}
          targetId={drag.targetId}
          selectedId={selectedId}
          onGrab={(event, bubble) => drag.start(event, { entryId: bubble.entryId, bubbleId: bubble.id })}
          onSelect={setSelectedId}
          onDuplicate={duplicate}
          onRemove={removeBubble}
          onEffectEnd={endEffect}
        >
          {/* One column down the board's left side: the quest log, with the spellbook below it once
              the player has one. Sharing a column is what keeps the two from covering each other. */}
          <div className="hud-left">
            <QuestTracker
              player={player}
              quests={progress.quests}
              requests={progress.requests}
              // A recipe someone mentioned is old news once the player has made the thing.
              hints={(progress.hints ?? []).filter((hint) => !byId.has(hint.entry.id))}
            />
            {focus && (
              <Spellbook
                focus={focus}
                spells={learnedSpells}
                level={progress.level}
                selectedId={selectedId}
                onSelect={setSelectedId}
                // The book wakes for any spell being carried, and for anything else once it is held over it.
                carrying={drag.zone === "spellbook" ? "over" : dragged?.kind === "spell" ? "dragging" : "none"}
                note={
                  !dragged
                    ? ""
                    : dragged.kind === "spell"
                      ? learnNote(dragged, progress.learned, progress.gold, progress.level)
                      : `Try it with your ${focus.name}`
                }
                busy={bookBusy}
                arriving={focusIsNew}
                bookRef={spellbookRef}
              />
            )}
          </div>
          <button className="clear" onClick={clearBoard} disabled={bubbles.length === 0}>
            Clear board
          </button>
          <StatusBar
            progress={progress}
            job={job}
            rank={rank}
            jobDrag={dragged?.kind !== "job" ? "none" : drag.zone === "job" ? "over" : "dragging"}
            jobRef={jobRef}
            onOpenOrders={openOrders}
            dayBusy={dayBusy}
            onEndDay={goToBed}
            onShowLedger={() => setLedger(day?.lastLedger ? { page: day.lastLedger, fresh: false } : null)}
          />
          {/* The street takes the board's place. The status box, the notes and the cards stay over it. */}
          {place === "town" && (
            <Town
              town={town}
              problem={townProblem}
              gold={progress.gold}
              level={progress.level}
              day={day}
              busy={townBusy}
              onBuyPlot={() => build(() => buyPlot(player))}
              onRaise={(plot, building) => build(() => raiseBuilding(player, plot, building))}
              onUpgrade={(plot) => build(() => upgradeBuilding(player, plot))}
              onLeave={() => visit("bench")}
              entries={byId}
              carrying={dragged ?? null}
              overShelf={drag.zone?.startsWith("slot:") ? drag.zone.slice(5) : null}
              rules={shift?.rules ?? null}
              onGrabShelf={(event, entry, plot, slot) => {
                fromShelf.current = { plot, slot };
                drag.start(event, { entryId: entry.id, bubbleId: null });
              }}
              onClearShelf={(plot, slot) => build(() => stockShelf(player, plot, slot, null))}
              onHand={(plot) => build(() => lendHand(player, plot))}
              called={new Set(called.day === (day?.number ?? 0) ? called.people : [])}
              spells={learnedSpells.length}
              visitorWaiting={progress.eventReady || event !== null}
              overPlot={drag.zone?.startsWith("plot:") ? Number(drag.zone.slice(5)) : null}
              onCall={callOnPerson}
              onMeal={haveAMeal}
              onTonight={takePart}
              visitorPlace={seat}
              onSit={() => (event ? setEventOpen(true) : void showEvent("waiting"))}
            />
          )}
          <div className="toasts">
            {error && (
              <p className="notice" role="alert">
                {error}{" "}
                <button className="link" onClick={() => setError("")}>
                  dismiss
                </button>
              </p>
            )}
            {someoneWaiting &&
              (visitor && visitor.kind !== "sit" ? (
                <p className="event-coming">{visitor.text}</p>
              ) : (
                <button
                  className="event-waiting"
                  disabled={eventBusy !== ""}
                  onClick={() => (event ? setEventOpen(true) : showEvent("waiting"))}
                >
                  {visitor ? visitor.text : "Someone is still at your door. Go back to them."}
                </button>
              ))}
            {someoneComing && !someoneWaiting && <p className="event-coming">Someone is on their way…</p>}
            <div role="status">
              {toasts.map((toast) => (
                <p
                  key={toast.id}
                  className="toast"
                  onAnimationEnd={() => setToasts((current) => current.filter((other) => other.id !== toast.id))}
                >
                  {toast.label} <strong>{toast.name}</strong>
                  {toast.gold !== undefined && (
                    <>
                      {" "}
                      <Gold amount={Math.abs(toast.gold)} prefix={toast.gold < 0 ? "−" : "+"} />
                    </>
                  )}
                  {!!toast.xp && <span className="toast-xp"> +{toast.xp} XP</span>}
                </p>
              ))}
            </div>
          </div>
          {/* Over the board only, so the top bar and its test button stay in reach. */}
          {ordersOpen && (
            <OrderBoard
              board={shift}
              problem={shiftProblem}
              day={day}
              result={shiftResult}
              busy={shiftBusy}
              onWork={work}
              onNext={() => setShiftResult(null)}
              onClose={() => setOrdersOpen(false)}
            />
          )}
          {event && eventOpen && (
            <EventCard
              event={event}
              earlierEffects={reaction}
              ending={ending}
              busy={eventBusy === "responding"}
              onRespond={respond}
              onClose={closeEvent}
            />
          )}
          {/* A visitor who took the last of the time is heard out first. The ledger waits for their card to close. */}
          {ledger && !(event && eventOpen) && <NightLedger ledger={ledger.page} fresh={ledger.fresh} onClose={() => setLedger(null)} />}
        </Board>
      </div>

      {/* The right-hand page of an open book, with bookmarks sticking out past its spine. */}
      <aside className="book" ref={panelRef}>
        <nav className="bookmarks" aria-label="Book sections">
          <button
            className="bookmark mark-discovered"
            aria-current={tab === "discovered" ? "page" : undefined}
            onClick={() => openTab("discovered")}
          >
            Discovered
          </button>
          {!shopShut && (
            <button className="bookmark mark-shop" aria-current={tab === "shop" ? "page" : undefined} onClick={() => openTab("shop")}>
              Shop
            </button>
          )}
          {/* Not a page of the book: it swaps the board for the street, and back. */}
          <button className="bookmark mark-town" aria-pressed={place === "town"} onClick={() => visit(place === "town" ? "bench" : "town")}>
            Town
          </button>
        </nav>
        <div className="book-pages">
          <div className="book-page" ref={pages.page}>
            {tab === "discovered" ? (
              <Organizer
                entries={loose}
                organize={organize}
                selected={selectedId ? byId.get(selectedId) : undefined}
                status={loaded ? "" : loadError ? `${loadError} Trying again…` : "Loading…"}
                onOrganize={(next, turn) => (turn ? pages.turn(turn, () => setOrganize(next)) : setOrganize(next))}
                onGrab={(event, entry) => {
                  fromShelf.current = null;
                  drag.start(event, { entryId: entry.id, bubbleId: null });
                }}
                onSpawn={spawn}
                onInspect={(entry) => setSelectedId(entry.id)}
              />
            ) : (
              <Shop view={shop} gold={progress.gold} buying={buying} onBuy={buyFromShop} />
            )}
          </div>
        </div>
      </aside>

      {dragged && (
        <div className="ghost" ref={drag.ghostRef} aria-hidden="true">
          <EntryBubble entry={dragged} tabIndex={-1} />
        </div>
      )}
    </main>
  );
}
