import puppeteer, { type KeyInput, type Page } from "puppeteer";

type Step =
  | { type: "click"; selector: string }
  | { type: "type"; text: string }
  | { type: "press"; key: KeyInput }
  | { type: "waitForNav" };

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
  }
};

const start = async (): Promise<void> => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  await page.goto("https://google.com", { waitUntil: "domcontentloaded" });

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

  await steps.reduce(
    (promise: Promise<void>, step: Step) =>
      promise.then(() => runStep(page, step)),
    Promise.resolve(),
  );

  // Get screenshot
  const snip = await page.screenshot({ encoding: "base64" });
  console.log(snip);

  await browser.close();
};

start().catch((e) => {
  console.error(e);
});
