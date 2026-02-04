require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  res.status(200).send("NFC Webhook Server is Running ✅");
});

// ✅ Prove ClickUp auth works
app.get("/health/clickup", async (req, res) => {
  try {
    const r = await axios.get("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: process.env.CLICKUP_API_TOKEN }
    });
    res.json({ ok: true, user: r.data.user?.username || r.data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.response?.data || err.message });
  }
});

async function handleNfc(req, res) {
  const providedKey = req.query.key;

  if (process.env.WEBHOOK_SECRET && providedKey !== process.env.WEBHOOK_SECRET) {
    console.log("Unauthorized: bad or missing key");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("Headers:", req.headers);
  console.log("Query:", req.query);
  console.log("Body:", req.body);
  console.log("CLICKUP_API_TOKEN length:", process.env.CLICKUP_API_TOKEN?.length);

  try {
    const response = await axios.post(
      `https://api.clickup.com/api/v2/list/${process.env.CLICKUP_LIST_ID}/task`,
      {
        name: "Guest Check-In",
        description:
          `NFC tap received:\n\nQuery:\n${JSON.stringify(req.query, null, 2)}\n\nBody:\n${JSON.stringify(req.body, null, 2)}`
      },
      {
        headers: {
          Authorization: process.env.CLICKUP_API_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("ClickUp task created:", response.data.id);
    return res.status(200).json({ success: true, clickupTaskId: response.data.id });
  } catch (err) {
    console.error("ClickUp error:", err.response?.data || err.message);
    return res.status(500).json({ error: "ClickUp task failed", detail: err.response?.data || err.message });
  }
}

app.post("/nfc", handleNfc);
app.post("/nfc-webhook", handleNfc);

// ✅ add GET so browser/NFC URL tests work
app.get("/nfc", handleNfc);
app.get("/nfc-webhook", handleNfc);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

