"use client";

import { X } from "lucide-react";
import qrcode from "qrcode-generator";
import { DogmeetDialog, requestDialogClose } from "../../../components/ui/DogmeetFrame";

const qr = qrcode(0, "H");
qr.addData("https://dogmeet.ru", "Byte");
qr.make();
const size = qr.getModuleCount();
let modules = "";
let grass = "";
for (let row = 0; row < size; row++) {
  for (let col = 0; col < size; col++) {
    if (!qr.isDark(row, col)) continue;
    modules += `M${col} ${row}h1v1h-1z`;
    // Keep blades inside dark modules and leave finder patterns solid.
    if ((row < 8 && (col < 8 || col >= size - 8)) || (row >= size - 8 && col < 8)) continue;
    grass += `M${col + 0.2} ${row + 0.85}l0.15 -0.55m0.15 0.55l-0.05 -0.65m0.25 0.65l0.1 -0.45`;
  }
}

export function SiteShareDialog({ onDismiss }: { onDismiss: () => void }) {
  return <DogmeetDialog className="sheet--site-share" title="Поделиться сайтом" onDismiss={onDismiss}
    footer={<button className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget)}>Готово</button>}>
    <div className="site-share-heading">
      <h2>Поделиться сайтом</h2>
      <button className="icon-button" type="button" aria-label="Закрыть" onClick={(event) => requestDialogClose(event.currentTarget)}><X aria-hidden="true" /></button>
    </div>
    <svg className="site-share-qr" role="img" aria-label="QR-код сайта https://dogmeet.ru" viewBox={`-4 -4 ${size + 8} ${size + 8}`} xmlns="http://www.w3.org/2000/svg">
      <path d={modules} fill="#163f25" shapeRendering="crispEdges" />
      <path d={grass} fill="none" stroke="#315e32" strokeWidth="0.07" />
    </svg>
  </DogmeetDialog>;
}
