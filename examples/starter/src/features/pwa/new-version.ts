/**
 * Calls `onNewVersion` the first time a lazily loaded chunk fails to load — after a deploy the old
 * hashed chunks are gone from the server. The event is not cancelled: cancelling makes the import
 * resolve to undefined and the failure surfaces somewhere obscure, while letting it through puts the
 * route's error boundary on screen next to the prompt.
 */
export function watchForNewVersion(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  onNewVersion: () => void,
): () => void {
  let announced = false;
  const listener = () => {
    if (announced) return;
    announced = true;
    onNewVersion();
  };
  target.addEventListener("vite:preloadError", listener);
  return () => target.removeEventListener("vite:preloadError", listener);
}
