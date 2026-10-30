import { Gallery } from "./gallery/Gallery";
import { Wordmark } from "./components/brand";

/** Tiny path router until the role screens arrive (FB-2). */
export function App() {
  if (location.pathname.startsWith("/dev/gallery")) return <Gallery />;
  return (
    <main className="gallery">
      <div className="gallery-section">
        <Wordmark />
        <p>Screens for every role arrive in the next build step.</p>
        <a href="/dev/gallery">Open the component gallery</a>
      </div>
    </main>
  );
}
