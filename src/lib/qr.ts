import QRCode from "qrcode";

// Namesake — QR codes.
//
// Rendered as inline SVG rather than a PNG data URI: it stays crisp at any
// size, prints properly, and adds nothing to the page weight worth counting.
// This matters because the whole point is that someone scans it across a
// room, off a card sitting on a table.

export async function qrSvg(url: string, opts: { margin?: number; dark?: string } = {}) {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    // A little quiet zone; too little and phone cameras struggle.
    margin: opts.margin ?? 2,
    color: { dark: opts.dark ?? "#4a3340", light: "#ffffff" },
  });
}
