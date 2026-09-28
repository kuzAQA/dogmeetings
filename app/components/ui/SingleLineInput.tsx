"use client";

import { type ComponentPropsWithoutRef, useLayoutEffect, useRef } from "react";

type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isVisibleFormField(element: Element): element is FormField {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return false;
  if (element instanceof HTMLInputElement && (element.type === "hidden" || element.readOnly)) return false;
  return !element.matches(":disabled, [aria-disabled=\"true\"]")
    && !element.closest("[hidden], [aria-hidden=\"true\"]")
    && getComputedStyle(element).visibility === "visible"
    && element.getClientRects().length > 0;
}

function nextFormField(input: HTMLInputElement) {
  const form = input.form;
  if (!form) return null;
  const fields = Array.from(form.elements).filter(isVisibleFormField);
  return fields.slice(fields.indexOf(input) + 1)[0] ?? null;
}

export function SingleLineInput({ autoComplete, className, enterKeyHint, onKeyDown, ...props }: ComponentPropsWithoutRef<"input">) {
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && !enterKeyHint) input.enterKeyHint = nextFormField(input) ? "next" : "done";
  });

  return <input {...props} ref={inputRef} autoComplete={autoComplete === "off" ? "new-password" : autoComplete} className={["single-line-input", className].filter(Boolean).join(" ")} enterKeyHint={enterKeyHint} onKeyDown={(event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Enter" || event.nativeEvent.isComposing || !(window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)) return;
    if (!event.currentTarget.form) return;
    event.preventDefault();
    const next = nextFormField(event.currentTarget);
    if (next) next.focus({ preventScroll: true });
    else event.currentTarget.form?.requestSubmit();
  }} />;
}
