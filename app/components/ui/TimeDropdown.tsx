"use client";

import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from "@ncdai/react-wheel-picker";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

function nextMinuteOption(minute: number) {
  return minuteOptions.find((option) => Number(option) >= minute) ?? minuteOptions[minuteOptions.length - 1];
}

type TimeDropdownProps = {
  value: string;
  futureOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onOpenChange?: (open: boolean) => void;
  onChange: (value: string) => void;
};

export function TimeDropdown({ value, futureOnly = false, invalid = false, describedBy, onOpenChange, onChange }: TimeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [referenceTime, setReferenceTime] = useState(() => new Date());
  const [draftHour, setDraftHour] = useState("00");
  const [draftMinute, setDraftMinute] = useState("00");
  const [reducedMotion, setReducedMotion] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const currentHour = referenceTime.getHours();
  const currentMinute = referenceTime.getMinutes();
  const hourPickerOptions = useMemo<WheelPickerOption<string>[]>(() => hourOptions.map((hour) => ({
    label: hour,
    value: hour,
    disabled: futureOnly && Number(hour) < currentHour
  })), [currentHour, futureOnly]);
  const minutePickerOptions = useMemo<WheelPickerOption<string>[]>(() => minuteOptions.map((minute) => ({
    label: minute,
    value: minute,
    disabled: futureOnly && Number(draftHour) === currentHour && Number(minute) < currentMinute
  })), [currentHour, currentMinute, draftHour, futureOnly]);

  function openTimeMenu() {
    const now = new Date();
    const [savedHour = "", savedMinute = ""] = value.split(":");
    const savedTimeIsValid = hourOptions.includes(savedHour) && minuteOptions.includes(savedMinute);
    const savedTimeIsAvailable = savedTimeIsValid && (!futureOnly || Number(savedHour) > now.getHours() || (
      Number(savedHour) === now.getHours() && Number(savedMinute) >= now.getMinutes()
    ));

    setReferenceTime(now);
    setDraftHour(savedTimeIsAvailable ? savedHour : futureOnly ? hourOptions[now.getHours()] : hourOptions[0]);
    setDraftMinute(savedTimeIsAvailable ? savedMinute : futureOnly ? nextMinuteOption(now.getMinutes()) : minuteOptions[0]);
    setOpen(true);
    onOpenChange?.(true);
  }

  const closeTimeMenu = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTimeMenu();
    };
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("[data-rwp]")?.focus());
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, closeTimeMenu]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setReducedMotion(query.matches);
    updateReducedMotion();
    query.addEventListener("change", updateReducedMotion);
    return () => query.removeEventListener("change", updateReducedMotion);
  }, []);

  return (
    <div className="custom-select time-dropdown">
      <input type="hidden" name="walkTime" value={value} />
      <button
        ref={triggerRef}
        className="custom-select-trigger"
        type="button"
        role="combobox"
        aria-label="Время прогулки"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-controls={dialogId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) closeTimeMenu();
          else openTimeMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openTimeMenu();
          }
        }}
      >
        <span className={value ? "" : "custom-select-placeholder"}>{value || "--:--"}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && createPortal((
        <div className="time-picker-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) closeTimeMenu();
        }}>
          <div ref={dialogRef} className="time-picker-sheet" id={dialogId} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <h2 id={titleId}>Укажите время прогулки</h2>
            <WheelPickerWrapper className="time-picker-wheels">
              <div className="time-picker-wheel" role="group" aria-label="Часы">
                <WheelPicker
                  value={draftHour}
                  onValueChange={(hour) => {
                    setDraftHour(hour);
                    if (futureOnly && Number(hour) === currentHour && Number(draftMinute) < currentMinute) {
                      setDraftMinute(nextMinuteOption(currentMinute));
                    }
                  }}
                  options={hourPickerOptions}
                  infinite={false}
                  visibleCount={12}
                  optionItemHeight={44}
                  dragSensitivity={reducedMotion ? 10000 : undefined}
                  scrollSensitivity={reducedMotion ? 1000000 : undefined}
                  classNames={{
                    optionItem: "time-picker-option",
                    highlightWrapper: "time-picker-highlight",
                    highlightItem: "time-picker-highlight-item"
                  }}
                />
              </div>
              <div className="time-picker-wheel" role="group" aria-label="Минуты">
                <WheelPicker
                  value={draftMinute}
                  onValueChange={setDraftMinute}
                  options={minutePickerOptions}
                  infinite={false}
                  visibleCount={12}
                  optionItemHeight={44}
                  dragSensitivity={reducedMotion ? 10000 : undefined}
                  scrollSensitivity={reducedMotion ? 1000000 : undefined}
                  classNames={{
                    optionItem: "time-picker-option",
                    highlightWrapper: "time-picker-highlight",
                    highlightItem: "time-picker-highlight-item"
                  }}
                />
              </div>
            </WheelPickerWrapper>
            <button className="primary-button time-picker-save" type="button" onClick={() => {
              onChange(`${draftHour}:${draftMinute}`);
              closeTimeMenu();
            }}>Сохранить</button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
