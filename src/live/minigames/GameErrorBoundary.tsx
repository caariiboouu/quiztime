import { Component, type ReactNode } from "react";

/** If a 3D scene throws (bad driver, lost context…), show the fallback instead. */
export class GameErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("3D minigame failed; using the 2D version", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
