import { SITE } from "../shared/site";
export default function ContactLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`contact-links ${className}`} aria-label="Contact">
      <a href={SITE.xUrl} target="_blank" rel="noopener noreferrer">
        Contact on X ↗
      </a>
    </nav>
  );
}
