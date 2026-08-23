"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
};

type DropdownSelectProps = {
  id: string;
  name?: string;
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  emptyText?: string;
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
};

export function DropdownSelect({
  id,
  name,
  value,
  options,
  placeholder = "Выберите значение",
  emptyText = "Нет доступных вариантов",
  ariaLabel,
  disabled = false,
  invalid = false,
  describedBy,
  onBlur,
  onChange
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const listId = `${id}-options`;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className="custom-select"
      ref={rootRef}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        onBlur?.();
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        className="custom-select-trigger"
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !disabled) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={selectedOption ? "" : "custom-select-placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="place-options custom-select-options" id={listId} role="listbox">
          {options.length > 0 ? options.map((option) => (
            <button
              className="place-option"
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          )) : (
            <p className="place-options-status">{emptyText}</p>
          )}
        </div>
      )}
    </div>
  );
}
