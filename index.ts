import puppeteer from "puppeteer";

const start = async (): Promise<void> => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://google.com");

  const snip = await page.screenshot({ encoding: "base64" });
  console.log(snip.toString());

  await browser.close();
};

start().catch((e) => {
  console.error(e);
});
