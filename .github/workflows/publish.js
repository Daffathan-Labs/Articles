const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function main() {
  const dir = path.join(process.cwd(), "articles");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, "utf8");

    // Extract metadata using HTML comments
    const getMeta = (key) => {
      const regex = new RegExp(`<!--\\s*${key}:\\s*(.*?)\\s*-->`, "i");
      const match = content.match(regex);
      return match ? match[1].trim() : null;
    };

    const title = getMeta("title");
    const excerpt = getMeta("excerpt");
    const date = getMeta("date");
    
    // Remove metadata lines from content
    const cleanContent = content.replace(/<!--[\s\S]*?-->/g, "").trim();

    console.log(`Publishing article: ${title}`);

    await axios.post(
      `${process.env.API_URL}/articles`,
      {
        title,
        excerpt,
        date,
        content: cleanContent,
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
