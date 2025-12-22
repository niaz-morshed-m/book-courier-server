const fs = require("fs");
const key = fs.readFileSync("./book-courier.json", "utf8");
const base64 = Buffer.from(key).toString("base64");

