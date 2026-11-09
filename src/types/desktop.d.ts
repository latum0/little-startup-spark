import type { DesktopBridge } from "../../electron/shared.cjs";

declare global {
  interface Window {
    nexus?: DesktopBridge;
  }
}

export {};
