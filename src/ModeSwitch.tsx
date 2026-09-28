import React from 'react';

/**
 * The mode switch: two states, one control, and it moves rather than jumps.
 *
 * Shadcn's anatomy without Shadcn's package. The parts a Switch needs are a root that owns
 * the state and a thumb that reflects it, and that is what this is - a button carrying
 * role and state, and one element that slides. shadcn/ui is source you copy into a
 * repository rather than a runtime dependency, so the two things it would have brought
 * that are actually worth having are the anatomy above and the data-state attribute, and
 * both are here. What it would also have brought is Tailwind and Radix, and this project
 * has neither: its whole stylesheet is hand-written and it loads no component library. A
 * dependency-free component that matches the design is worth more than a faithful one that
 * also brings a build pipeline.
 *
 * The reason it is a radiogroup rather than a switch is that this is not a boolean. A
 * switch announces on and off, and this is agent or chat, so it is announced by name -
 * which is what a screen reader needs to make sense of two named destinations.
 */

export type ModeOption<T extends string> = {
  value: T;
  /** Already translated. The switch never renders a raw key. */
  label: string;
  icon?: React.ReactNode;
};

export function ModeSwitch<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<ModeOption<T>>;
  label: string;
  id: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  // Arrow keys move between the two, because a two-state control inside a toolbar or a
  // form is expected to answer the keyboard without a tab stop per option. The thumb's
  // position is a custom property rather than a class, so the transition is one animated
  // property instead of a different rule per state - and so it can be suppressed for
  // reduced motion by changing the transition, not by adding branches here.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
      : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    document.getElementById(`${id}-${options[next].value}`)?.focus();
  };

  return <div className="mode-switch" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}
    style={{'--ms-index': index} as React.CSSProperties}>
    {/* Decorative. The thumb is painted from --ms-index on the track, so this only has to
        exist to give the sliding element something to be. */}
    <span className="mode-switch-thumb" aria-hidden="true"/>
    {options.map((o) => {
      const on = o.value === value;
      return <button
        key={o.value}
        id={`${id}-${o.value}`}
        type="button"
        role="radio"
        aria-checked={on}
        tabIndex={on ? 0 : -1}
        className={'mode-switch-option' + (on ? ' on' : '')}
        data-value={o.value}
        onClick={() => onChange(o.value)}
      >
        {o.icon}
        <span>{o.label}</span>
      </button>;
    })}
  </div>;
}
