import puppeteer, { type KeyInput, type Page } from "puppeteer";

type Step =
  | { type: "click"; selector: string }
  | { type: "type"; text: string }
  | { type: "press"; key: KeyInput }
  | { type: "waitForNav" }
  | { type: "special"; func: (page: Page) => Promise<void> };

const url: string = "https://google.com";
const steps: Step[] = [
  { type: "click", selector: "#APjFqb" },
  { type: "type", text: "tester" },
  { type: "press", key: "Enter" },
  { type: "waitForNav" },
];

const runStep = async (page: Page, thing: Step): Promise<void> => {
  if (thing.type === "click") {
    await page.waitForSelector(thing.selector, { visible: true });
    await page.click(thing.selector);
  } else if (thing.type === "type") {
    await page.keyboard.type(thing.text);
  } else if (thing.type === "press") {
    await page.keyboard.press(thing.key);
  } else if (thing.type === "waitForNav") {
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  } else if (thing.type === "special") {
    await thing.func(page);
  }
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
    (promise: Promise<void>, step: Step, i: number) =>
      promise.then(async () => {
        await runStep(page, step);
        // Get screenshot
        const snip = await page.screenshot({ encoding: "base64" });
        snips.push({ index: i, snip });
      }),
    (async () => {
      // Get screenshot
      const snip = await page.screenshot({ encoding: "base64" });
      snips.push({ index: -1, snip });
    })(),
  );

  console.log(JSON.stringify(snips));

  await browser.close();
};

start().catch((e) => {
  console.error(e);
});
