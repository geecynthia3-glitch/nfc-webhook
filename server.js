require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // supports "POST parameters" style too

// Log every request so you can SEE it hitting the server
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  res.status(200).send("NFC Webhook Server is Running ✅");
});

function handleNfc(req, res) {
  const secret = req.headers["x-webhook-secret"];

  // If you set WEBHOOK_SECRET in Render, we enforce it.
  // If you didn't set it yet, we allow requests to help you test quickly.
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    console.log("Unauthorized: bad or missing x-webhook-secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  return res.status(200).json({ ok: true, received: req.body });
}

// Accept BOTH routes so your NFC Tools URL doesn't have to be perfect
app.post("/nfc", handleNfc);
app.post("/nfc-webhook", handleNfc);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
