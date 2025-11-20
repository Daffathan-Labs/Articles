const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { marked } = require("marked");

async function main() {
  const dir = path.join(process.cwd(), "articles");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const raw = fs.readFileSync(fullPath, "utf8");

    // Extract metadata (KEEP → used later)
    const getMeta = (key) => {
      const regex = new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`, "i");
      const match = raw.match(regex);
      return match ? match[1].trim() : null;
    };

    const title = getMeta("title");
    const excerpt = getMeta("excerpt");
    const date = getMeta("date");
    const image = getMeta("image");
    const category = getMeta("category");

    console.log(`📤 Publishing article: ${title}`);

    // Remove metadata from content ONLY
    const markdownBody = raw.replace(/<!--[\s\S]*?-->/g, "").trim();

    // Convert markdown → HTML
    const htmlBody = marked.parse(markdownBody);

    // Send to API
    await axios.post(
      `${process.env.API_URL}/articles`,
      {
        title,
        excerpt,
        date,
        category,
        image,
        content: htmlBody
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
  }

  console.log("✅ All articles processed and uploaded!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
