import puppeteer from "puppeteer";

const start = async (): Promise<void> => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://google.com");

  // const snip = await page.screenshot({ encoding: "base64" });
  await page.evaluate(() => {
    const el = document.querySelectorAll("script");
    for (let i = 0; i < el.length; i++) {
      el[i].parentNode?.removeChild(el[i]);
    }
  });
  const content = await page.content();
  console.log(content);

  await browser.close();
};

start().catch((e) => {
  console.error(e);
});
