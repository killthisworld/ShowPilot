// The event's photo as a faint backdrop across a whole event bar (Home
// lists, desktop month columns). It fades in from the left so the
// type-color stripe and the title side stay clean, and sits low enough
// that text on top never needs a shadow.
//
// The bar must be `relative isolate overflow-hidden`: `isolate` makes this
// -z-10 layer paint above the bar's own background but under its content.
export default function EventBarPhoto({ url, opacity = 0.22 }) {
  if (!url) return null;
  return (
    <span aria-hidden="true" className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity,
          filter: "saturate(1.1)",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.6) 30%, #000 70%)",
          maskImage: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.6) 30%, #000 70%)",
        }}
      />
    </span>
  );
}
