const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { marked } = require("marked"); // <-- ADD THIS

async function main() {
  const dir = path.join(process.cwd(), "articles");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, "utf8");

    // Extract metadata from HTML comments
    const getMeta = (key) => {
      const regex = new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`, "i");
      const match = content.match(regex);
      return match ? match[1].trim() : null;
    };

    const title = getMeta("title");
    const excerpt = getMeta("excerpt");
    const date = getMeta("date");
    const image = getMeta("image");
    const category = getMeta("category");

    // Hapus semua metadata comment
    const mdWithoutMeta = content.replace(/<!--[\s\S]*?-->/g, "").trim();

    // Convert Markdown → HTML
    const htmlContent = marked(mdWithoutMeta);

    console.log(`Publishing article: ${title}`);

    await axios.post(
      `${process.env.API_URL}/articles`,
      {
        title: title,
        excerpt: excerpt,
        date: date,
        image: image,
        category: category,
        content: htmlContent,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
  }

  console.log("Done publishing all articles!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
