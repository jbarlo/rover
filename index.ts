import puppeteer from "puppeteer";

const start = async (): Promise<void> => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://google.com");

  // Remove scripts
  await page.evaluate(() => {
    const el = document.querySelectorAll("script");
    for (let i = 0; i < el.length; i++) {
      el[i].parentNode?.removeChild(el[i]);
    }
  });
  const content = await page.content();
  // console.log(content);
  await browser.close();

  const browser2 = await puppeteer.launch();
  const page2 = await browser2.newPage();
  // Reload content
  await page2.setContent(content);

  // Get screenshot
  const snip = await page2.screenshot({ encoding: "base64" });
  console.log(snip);

  await browser2.close();
};

start().catch((e) => {
  console.error(e);
});
