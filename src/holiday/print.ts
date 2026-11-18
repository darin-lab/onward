// Printable Holiday Party invites (one Letter page each, with a tear-off RSVP slip).
// Opens a print window; "Save as PDF" in the print dialog makes the PDF.
// Temporary feature: see ./README.md for removal.
import { PARTY } from "@/holiday/types";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const FLAKE = `<svg width="48" height="48" viewBox="0 0 44 44" fill="none" stroke="#A8842C" stroke-width="1.6" stroke-linecap="round"><path d="M22 3v38M3 22h38M8.6 8.6l26.8 26.8M35.4 8.6L8.6 35.4"/><path d="M17 6l5 5 5-5M17 38l5-5 5 5M6 17l5 5-5 5M38 17l-5 5 5 5"/></svg>`;

function page(name: string, manager: string) {
  const n = esc(name);
  return `<section class="page"><div class="f1"><div class="f2">
  <div class="top">
    ${FLAKE}
    <div class="co">Driven Auto Care</div>
    <h1>Holiday Party</h1>
    <div class="for">This invitation is for</div>
    <div class="who">${n} &amp; Family</div>
    <p class="it">Join the whole team to celebrate the season. Bring your family.</p>
    <div class="dl"><span class="r"></span><span class="d">${esc(PARTY.day)}</span><span class="r"></span></div>
    <div class="tm">${esc(PARTY.time)}</div>
    <div class="ad">${esc(PARTY.place)}<br>${esc(PARTY.address)}</div>
  </div>
  <div class="cut"><span>&#9986;</span><i></i><b>Cut here and return</b><i class="s"></i></div>
  <div class="slip">
    <div class="sh"><span class="rsvp">RSVP</span><span>Please hand this back to ${esc(manager)}</span></div>
    <div class="nm">Name: <strong>${n}</strong></div>
    <div class="boxes"><span><u></u>Yes, we will be there</span><span><u></u>No, we can't make it</span></div>
    <div class="cnt">Number attending, including you: <em></em></div>
    <div class="small">Your manager will enter your answer in the shop app.</div>
  </div>
</div></div></section>`;
}

const STYLE = `
@page{size:letter;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#20262E;font-family:'Jost',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;height:11in;padding:.42in;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.f1{height:100%;border:2px solid #A8842C;padding:8px}
.f2{height:100%;border:1px solid #9AA3AF;display:flex;flex-direction:column}
.top{height:6.3in;display:flex;flex-direction:column;align-items:center;text-align:center;padding:.5in .6in 0}
.co{margin-top:12px;font-size:14px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:#3B4552}
h1{margin:0;font-family:'Pinyon Script',cursive;font-weight:400;font-size:100px;line-height:1.15;color:#A8842C}
.for{font-size:13px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:#4B5563}
.who{margin-top:6px;font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:600}
.it{margin:12px 0 0;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:22px}
.dl{display:flex;align-items:center;gap:16px;margin-top:22px}
.r{display:inline-block;height:1px;width:70px;background:#A8842C}
.d{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600}
.tm{margin-top:6px;font-size:18px;font-weight:500;letter-spacing:.08em}
.ad{margin-top:12px;font-size:16px;line-height:1.5;color:#3B4552}
.cut{display:flex;align-items:center;gap:10px;padding:0 20px;color:#4B5563}
.cut i{flex-grow:1;border-top:2px dashed #767676}
.cut i.s{flex-grow:0;width:40px}
.cut b{font-weight:400;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.slip{flex-grow:1;padding:22px 56px 28px;display:flex;flex-direction:column;gap:18px}
.sh{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;color:#3B4552}
.rsvp{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:#20262E}
.nm{font-size:16px}.nm strong{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;margin-left:8px}
.boxes{display:flex;gap:48px;font-size:17px}
.boxes span{display:flex;align-items:center;gap:12px}
.boxes u{display:inline-block;width:24px;height:24px;border:2px solid #20262E;border-radius:3px}
.cnt{display:flex;align-items:flex-end;gap:12px;font-size:17px}
.cnt em{display:inline-block;width:90px;border-bottom:2px solid #20262E;height:24px}
.small{font-size:13px;color:#4B5563}
@media screen{body{background:#E9ECEF}.page{background:#fff;margin:16px auto;box-shadow:0 4px 20px rgba(0,0,0,.15)}}
`;

export function printInvites(names: string[], managerName: string) {
  if (names.length === 0) return;
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    return;
  }
  const title = names.length === 1 ? `Holiday Party invite - ${names[0]}` : "Holiday Party invites";
  w.document.open();
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Pinyon+Script&family=Jost:wght@400;500;600&display=swap">
<style>${STYLE}</style></head><body>${names.map((n) => page(n, managerName)).join("")}</body></html>`);
  w.document.close();
  const go = () => {
    w.focus();
    w.print();
  };
  // Wait for the fonts so the script heading prints in the right typeface.
  const fonts = (w.document as Document & { fonts?: FontFaceSet }).fonts;
  setTimeout(() => {
    if (fonts?.ready) void fonts.ready.then(go);
    else go();
  }, 400);
}
