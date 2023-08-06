import puppeteer from "puppeteer";

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
  await page.waitForSelector("#APjFqb", { visible: true });
  const textarea = await page.$("#APjFqb");
  await textarea?.click();

  await page.keyboard.type("tester");

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.keyboard.press("Enter"),
  ]);

  // Get screenshot
  const snip = await page.screenshot({ encoding: "base64" });
  console.log(snip);

  await browser.close();
};

start().catch((e) => {
  console.error(e);
});
