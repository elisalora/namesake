/// The promise that sits under a button which actually charges — and only
/// under those.
///
/// It used to live under the start form, where it was doing real sales work.
/// The free tier took that button's money away, so the sentence went with it —
/// and then failed to reappear anywhere, which left a gifter promised thirty
/// days and the self-serve buyer promised nothing. The self-serve buyer is the
/// entire person the free tier exists to convert.
///
/// Not under the nudge at turn eight. That is a soft prompt already carrying
/// two sentences, a button and the gift line; a fourth thing there is clutter.
/// This belongs where somebody has actually stopped and is deciding.
export default function RefundNote() {
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-soft">
      Paid once, nothing to cancel — and{" "}
      <a href="/refunds" className="underline underline-offset-2 hover:text-sage-deep">
        refundable
      </a>{" "}
      for thirty days.
    </p>
  );
}
