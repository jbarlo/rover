import puppeteer, { type KeyInput, type Page } from "puppeteer";
import fs from "fs";

type Step =
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

type StepWithExtras = Step & { screenShotParams?: ScreenshotParams };

const url: string =
  "https://www.adriancooney.ie/blog/web-scraping-via-javascript-heap-snapshots";
const steps: StepWithExtras[] = [
  { type: "waitForIdle", screenShotParams: { noSnip: true } },
  {
    type: "noop",
    screenShotParams: {
      selector: "p.chakra-text:nth-child(6)",
      noSnip: true,
    },
  },
  {
    type: "noop",
    screenShotParams: {
      selector: "p.chakra-text:nth-child(10)",
    },
  },
];

const runStep = async (page: Page, step: Step): Promise<void> => {
  if (step.type === "click") {
    await page.waitForSelector(step.selector, { visible: true });
    await page.click(step.selector);
  } else if (step.type === "type") {
    await page.keyboard.type(step.text);
  } else if (step.type === "press") {
    await page.keyboard.press(step.key);
  } else if (step.type === "waitForNav") {
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  } else if (step.type === "special") {
    await step.func(page);
  } else if (step.type === "waitForIdle") {
    await page.waitForNetworkIdle();
  } else if (step.type === "noop") {
    // noop
  }
};

const getSnip = async (page: Page, step: StepWithExtras): Promise<string> => {
  if (step.screenShotParams?.selector !== undefined) {
    const el = await page.$(step.screenShotParams?.selector);
    if (el === null) throw new Error("No matching selector");
    return (await el.screenshot({ encoding: "base64" })).toString();
  }
  return (await page.screenshot({ encoding: "base64" })).toString();
};

const start = async (): Promise<void> => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Remove scripts
  // await page.evaluate(() => {
  //   const el = document.querySelectorAll("script");
  //   for (let i = 0; i < el.length; i++) {
  //     el[i].parentNode?.removeChild(el[i]);
  //   }
  // });
  // const content = await page.content();
  // console.log(content);
  // await browser.close();

  // const browser2 = await puppeteer.launch({
  //   defaultViewport: { width: 1920, height: 1080 },
  // });
  // const page2 = await browser2.newPage();
  // Reload content
  // await page2.setContent(content);

  const snips: Array<{ index: number; snip: string }> = [];

  await steps.reduce(
    (promise: Promise<void>, step: StepWithExtras, i: number) =>
      promise.then(async () => {
        await runStep(page, step);
        // Get screenshot
        if (step.screenShotParams?.noSnip !== true) {
          const snip = await getSnip(page, step);
          snips.push({ index: i, snip });
        }
      }),
    (async () => {
      // Get screenshot
      const snip = await page.screenshot({ encoding: "base64" });
      snips.push({ index: -1, snip });
    })(),
  );

  fs.writeFileSync("./out.json", JSON.stringify(snips));
  // const heapSnapshot = await captureHeapSnapshot(page.target());
  // console.log(
  //   JSON.stringify(
  //     findObjectsWithProperties(
  //       heapSnapshot,
  //       ["name", "price", "description", "sku"],
  //       { ignoreProperties: ["nutritionProfiles", "image", "categories"] },
  //     ),
  //     undefined,
  //     4,
  //   ),
  // );

  await browser.close();
};

start().catch((e) => {
  console.error(e);
});
