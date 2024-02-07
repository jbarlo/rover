import { type KeyInput, type Page } from "puppeteer";

export type Step =
  | { type: "click"; selector: string }
  | { type: "type"; text: string }
  | { type: "press"; key: KeyInput }
  | { type: "waitForNav" }
  | { type: "noop" }
  | { type: "waitForIdle" }
  | { type: "special"; func: (page: Page) => Promise<void> };

interface ScreenshotParams {
  selector?: string;
  noSnip?: boolean;
}

export type StepWithExtras = Step & { screenShotParams?: ScreenshotParams };

export interface StepConfig {
  alias: string;
  url: string;
  steps: StepWithExtras[];
}
