const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { marked } = require("marked");

async function main() {
  const dir = path.join(process.cwd(), "articles");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));

  const articles = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, "utf8");

    // Extract metadata
    const getMeta = (key) => {
      const regex = new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`, "i");
      const match = content.match(regex);
      return match ? match[1].trim() : null;
    };

    const title = getMeta("title");
    const excerpt = getMeta("excerpt");
    const date = getMeta("date");
    const image = getMeta("image");

    // Remove metadata comments
    const mdWithoutMeta = content.replace(/<!--[\s\S]*?-->/g, "").trim();

    // Convert MD → HTML
    const htmlContent = marked(mdWithoutMeta);

    console.log(`✔ Parsed: ${title}`);

    articles.push({
      title,
      excerpt,
      date,
      image,
      content: htmlContent,
    });
  }

  console.log(`\n>> Sending ${articles.length} articles to backend...\n`);

  await axios.post(
    `${process.env.API_URL}/articles/sync`,
    { articles }, // <--- kirim array
    {
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
      },
    }
  );

  console.log("🎉 Successfully published all articles!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
