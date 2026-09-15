"use client";

import { ArrowRight, CheckCircle2, CircleAlert, PawPrint, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function DogmeetState({ state, title, message, action, onAction, children, onBack }: {
  state: "loading" | "error" | "empty" | "success";
  title?: string;
  message?: string;
  action?: string;
  onAction?: () => void;
  onBack?: () => void;
  children?: ReactNode;
}) {
  return <div className={`state-block ${state === "success" ? "success" : ""}`} role={state === "error" ? "alert" : state === "empty" ? undefined : "status"} aria-busy={state === "loading"}>
    {state === "loading" ? <div className="loader" /> : state === "error" ? <CircleAlert className="state-icon" /> : state === "success" ? <CheckCircle2 className="state-icon" /> : <PawPrint className="state-icon" />}
    <h2>{title ?? (state === "loading" ? "Загружаем…" : state === "error" ? "Не получилось загрузить" : state === "empty" ? "Здесь пока тихо" : "Готово")}</h2>
    <p>{message ?? (state === "loading" ? "Подождите, это займёт несколько секунд." : state === "error" ? "Проверьте соединение и попробуйте ещё раз. Ваши изменения не потеряны." : state === "empty" ? "Сообщите, когда пойдёте гулять. Компания начинается с вас." : "Изменения сохранены.")}</p>
    {state === "loading" && <><div className="skeleton" /><div className="skeleton short" /></>}
    {state !== "empty" && children}
    {onAction && <button className="button" type="button" onClick={onAction}>{state === "error" && <RefreshCw />}{action ?? (state === "error" ? "Повторить" : "Готово")}{state === "success" && <ArrowRight />}</button>}
    {onBack && <button className="button quiet" type="button" onClick={onBack}>{state === "loading" ? "Вернуться" : "Назад"}</button>}
    {state === "empty" && children}
  </div>;
}
