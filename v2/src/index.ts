import "dotenv/config";
import OpenAI from "openai";

import fs from "fs";
import diff from "git-diff";
import { ChatCompletionContentPartImage } from "openai/resources/index.mjs";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

const getThing = async (
  systemPrompt: string,
  documentation: string,
  base64Images: string[]
) => {
  const imageContent: ChatCompletionContentPartImage[] = base64Images.map(
    (base64) => ({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${base64}`,
        detail: "low",
      },
    })
  );
  const response = await openai.chat.completions.create({
    model: "gpt-4-vision-preview",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [{ type: "text", text: documentation }, ...imageContent],
      },
    ],
    max_tokens: 300,
  });
  return response;
};

async function main() {
  const base64Original = fs.readFileSync("./images/original.png", "base64");
  const base64Diff = fs.readFileSync("./images/diff.png", "base64");

  const writerSystemPrompt = `
  You are a technical writer who edits documentation.
  You are given two images and a description of the changes made to the website.
  You aim to update the documentation accurately and with as few changes as possible.
  Never allude that the documentation has been updated.
  Don't refer to previous versions of documentation.
  Do not allow documentation to reference UI elements that no longer exist.
  Do not assume icons must be clicked.
  Do not assume functionality exists that isn't clearly stated in existing documentation or is standard behaviour for a UI element.
  Find the difference between these images and modify the documentation to reflect the changes.
  `.replace(/\s+/g, " ");

  const editorsSystemPrompt = `
  You are a technical writer who removes outdated documentation.
  You are given the current documentation and the current state of the website.
  Guarantee that the documentation does not reference UI elements that no longer exist.
  Do not make references to the documentation.
  Do not rephrase existing statements if they are still accurate.
  Do not assume functionality exists that isn't clearly stated in existing documentation.
  Do not assume icons must be clicked.
  You aim to update the documentation accurately and with as few changes as possible.
  Use chain-of-thought reasoning to determine if a statement is still accurate. Enclose all your reasoning within triple quotes (""")
  Modify the provided documentation to match the provided state of the website.
  `.replace(/\s+/g, " ");

  const documentation = `To search, enter your search terms into the textbox, then click "Google Search". Alternatively, click "I'm Feeling Lucky" to navigate to the first search result.`;

  const response = await getThing(writerSystemPrompt, documentation, [
    base64Original,
    base64Diff,
  ]);
  console.log(JSON.stringify(response.choices));
  const writersMessage = response.choices[0]?.message.content ?? null;
  if (writersMessage) {
    const response = await getThing(editorsSystemPrompt, writersMessage, [
      base64Diff,
    ]);
    console.log(JSON.stringify(response.choices));
    const editorsMessage = response.choices[0]?.message.content ?? null;
    if (editorsMessage) {
      console.log(
        diff(documentation, editorsMessage, { color: true, wordDiff: true })
      );
    }
  }
}

main();
