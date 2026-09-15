"use client";

import { ArrowRight, Compass, EllipsisVertical, Share2 } from "lucide-react";
import { DogmeetHeader } from "./DogmeetFrame";

export type BrowserGuidePlatform = "ios" | "android";

export function isInAppBrowser(userAgent: string) {
  return /(telegram|instagram|fbav|fban|vkshare|vkontakte|micromessenger|line\/|twitter|;\s*wv\)|gsa\/)/i.test(userAgent) || (/(iphone|ipad|ipod)/i.test(userAgent) && /applewebkit/i.test(userAgent) && !/safari/i.test(userAgent));
}

export function detectBrowserGuidePlatform(userAgent: string, platform: string, maxTouchPoints: number): BrowserGuidePlatform {
  return /Android/i.test(userAgent) && !(platform === "MacIntel" && maxTouchPoints > 1) ? "android" : "ios";
}

type Props = { platform: BrowserGuidePlatform; onPlatformChange: (platform: BrowserGuidePlatform) => void; onContinue: () => void; onBack?: () => void };

export function BrowserGuide({ platform, onPlatformChange, onContinue, onBack }: Props) {
  return (
    <div className="screen browser-guide-screen">
      <DogmeetHeader onBack={onBack} />
      <h1>Открыть в браузере</h1>
      <div className="guide-symbol">{platform === "ios" ? <Compass aria-hidden="true" /> : <EllipsisVertical aria-hidden="true" />}</div>
      <h2>Останемся<br />на связи</h2>
      <p>Откройте Dogmeet в обычном браузере, чтобы ваши питомцы и планы сохранились в этой сессии.</p>
      <div className="segmented" role="group" aria-label="Выберите устройство">
        <button type="button" aria-pressed={platform === "ios"} onClick={() => onPlatformChange("ios")}>iPhone</button>
        <button type="button" aria-pressed={platform === "android"} onClick={() => onPlatformChange("android")}>Android</button>
      </div>
      <div className="instruction"><span>1</span><div><strong>{platform === "ios" ? "Нажмите значок компаса" : "Нажмите три точки"}</strong><p>{platform === "ios" ? "Внизу окна Telegram выберите открытие в Safari." : "В правом верхнем углу откройте меню."}</p></div></div>
      <div className="instruction"><span>2</span><div><strong>{platform === "ios" ? "Откройте в Safari" : "Выберите «Открыть в браузере»"}</strong><p>{platform === "ios" ? "Сайт продолжит работу в обычной вкладке." : "Продолжите в Chrome или другом браузере."}</p></div></div>
      <div className="note"><Share2 aria-hidden="true" />Если сайт уже открыт в Safari или Chrome, просто продолжите.</div>
      <button className="button" type="button" onClick={onContinue}>Продолжить<ArrowRight aria-hidden="true" /></button>
    </div>
  );
}
