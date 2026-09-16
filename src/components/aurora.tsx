/**
 * Decorative animated "liquid glass" background — soft blue/violet glow
 * blobs drifting behind the content. Pure CSS (see globals.css), no deps.
 */
export default function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
    </div>
  );
}