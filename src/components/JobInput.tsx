import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { listJobNames } from "@/lib/packages";

const MAX = 6;

/** Job names that contain what's typed; ones starting with it (or with a word starting with it) first. */
function suggest(names: string[], typed: string): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const starts: string[] = [];
  const words: string[] = [];
  const contains: string[] = [];
  for (const n of names) {
    const l = n.toLowerCase();
    if (l === q) continue;
    if (l.startsWith(q)) starts.push(n);
    else if (l.split(/[\s\-–/]+/).some((w) => w.startsWith(q))) words.push(n);
    else if (l.includes(q)) contains.push(n);
  }
  return [...starts, ...words, ...contains].slice(0, MAX);
}

function Highlight({ text, typed }: { text: string; typed: string }) {
  const i = text.toLowerCase().indexOf(typed.trim().toLowerCase());
  if (i < 0 || !typed.trim()) return <>{text}</>;
  const end = i + typed.trim().length;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-cyan">{text.slice(i, end)}</span>
      {text.slice(end)}
    </>
  );
}

/** The Job box: as you type, existing job names show underneath to tap. Any new name still works. */
export function JobInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    listJobNames().then(
      (n) => live && setNames(n),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  const list = useMemo(() => suggest(names, value), [names, value]);
  const showing = open && list.length > 0;
  const listId = `${id}-suggestions`;

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        required
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        className="field font-sans text-[17px] font-semibold text-white"
        maxLength={120}
        autoComplete="off"
        placeholder="Job name"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % list.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? list.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(list[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showing ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Existing jobs"
          className="vw-page absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-[var(--radius-box)] border border-line bg-raised shadow-[0_12px_32px_rgb(0_0_0/0.55)]"
        >
          {list.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep the keyboard up: pick on press, before the box loses focus.
              onPointerDown={(e) => {
                e.preventDefault();
                pick(name);
              }}
              className={cx(
                "flex min-h-12 cursor-pointer items-center border-b border-hair px-3.5 text-[16px] text-ink last:border-b-0",
                i === active ? "bg-cyan/10" : "active:bg-panel",
              )}
            >
              <span className="truncate">
                <Highlight text={name} typed={value} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
