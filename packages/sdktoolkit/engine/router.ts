export class SPAObserver {
  private onRouteChanged: (newUrl: string) => void;
  private onBeforeRouteChanged?: () => void;
  private originalPushState: typeof history.pushState;
  private originalReplaceState: typeof history.replaceState;
  private lastPathname: string = window.location.pathname;
  private isListening: boolean = false;

  constructor(onRouteChangedCallback: (newUrl: string) => void, onBeforeRouteChangedCallback?: () => void) {
    this.onRouteChanged = onRouteChangedCallback;
    this.onBeforeRouteChanged = onBeforeRouteChangedCallback;
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
  }

  public listen() {
    // Guard: calling listen() twice would double-patch history and leak popstate listeners
    if (this.isListening) return;
    this.isListening = true;

    // Override pushState (e.g., standard React Router links)
    history.pushState = (...args) => {
      this.originalPushState.apply(history, args);
      this.triggerChangeEvent();
    };

    // Override replaceState (e.g., Redirects)
    history.replaceState = (...args) => {
      this.originalReplaceState.apply(history, args);
      this.triggerChangeEvent();
    };

    // Listen to browser Back/Forward buttons
    window.addEventListener('popstate', this.triggerChangeEvent);
  }

  private triggerChangeEvent = () => {
    const newPathname = window.location.pathname;

    // Skip if pathname didn't actually change (same-path pushState with only
    // hash/query change, or replaceState called with identical path).
    // Without this, AITour reinitialises on every query-string update (e.g., search filters).
    if (newPathname === this.lastPathname) return;
    this.lastPathname = newPathname;

    if (this.onBeforeRouteChanged) {
      try {
        this.onBeforeRouteChanged();
      } catch (err) {
        // Ignored
      }
    }

    // Give React/Vue one tick to commit the new route's DOM.
    // requestAnimationFrame is not enough for React 18 concurrent transitions —
    // a 50ms setTimeout gives the framework time to flush its fiber tree.
    setTimeout(() => {
      this.onRouteChanged(newPathname);
    }, 50);
  };

  public destroy() {
    if (!this.isListening) return;
    this.isListening = false;
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;
    window.removeEventListener('popstate', this.triggerChangeEvent);
  }
}