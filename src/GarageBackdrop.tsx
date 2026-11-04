export default function GarageBackdrop() {
  return (
    <picture className="garage-picture">
      <source
        media="(max-width: 600px) and (orientation: portrait)"
        srcSet="/art/launch-garage-mobile-v1.avif"
        type="image/avif"
      />
      <source
        media="(max-width: 600px) and (orientation: portrait)"
        srcSet="/art/launch-garage-mobile-v1.webp"
        type="image/webp"
      />
      <source srcSet="/art/launch-garage-v2.avif" type="image/avif" />
      <img
        className="launch-backdrop"
        src="/art/launch-garage-v2.webp"
        width="1672"
        height="941"
        alt=""
        fetchPriority="high"
      />
    </picture>
  );
}
