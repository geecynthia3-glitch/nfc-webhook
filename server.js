require("dotenv").config();
const express = require("express");
const axios = require("axios");

console.log("CLICKUP_API_TOKEN exists?", !!process.env.CLICKUP_API_TOKEN);
console.log("CLICKUP_LIST_ID exists?", !!process.env.CLICKUP_LIST_ID);
console.log("WEBHOOK_SECRET exists?", !!process.env.WEBHOOK_SECRET);
console.log("CLICKUP_API_TOKEN length:", process.env.CLICKUP_API_TOKEN?.length);


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

async function getClickUpTask(taskId) {
  const r = await axios.get(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: process.env.CLICKUP_API_TOKEN }
  });
  return r.data;
}

async function setClickUpField(taskId, fieldId, value) {
  return axios.post(
    `https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`,
    { value },
    {
      headers: {
        Authorization: process.env.CLICKUP_API_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );
}

function getCustomFieldValue(task, fieldId) {
  const f = (task.custom_fields || []).find(x => x.id === fieldId);
  return f?.value ?? null;
}

async function handleNfc(req, res) {
  const providedKey = req.query.key;

  if (process.env.WEBHOOK_SECRET && providedKey !== process.env.WEBHOOK_SECRET) {
    console.log("Unauthorized: bad or missing key");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("Query:", req.query);

  try {
    const masterTaskId = process.env.CLICKUP_EVENT_TASK_ID;
    const tapFieldId = process.env.CLICKUP_TAP_COUNT_FIELD_ID;
    const statusFieldId = process.env.CLICKUP_STATUS_FIELD_ID;

    if (!masterTaskId || !tapFieldId || !statusFieldId) {
      return res.status(500).json({
        error: "Missing env vars",
        missing: {
          CLICKUP_EVENT_TASK_ID: !masterTaskId,
          CLICKUP_TAP_COUNT_FIELD_ID: !tapFieldId,
          CLICKUP_STATUS_FIELD_ID: !statusFieldId
        }
      });
    }

    // 1) Read master task
    const task = await getClickUpTask(masterTaskId);

    // 2) Increment Tap Count
    const current = Number(getCustomFieldValue(task, tapFieldId) || 0);
    const nextCount = current + 1;

    // 3) Write Tap Count + Status
    await setClickUpField(masterTaskId, tapFieldId, nextCount);
    await setClickUpField(masterTaskId, statusFieldId, "Tapped");

    console.log("Updated master task:", masterTaskId, "tapCount:", nextCount);

    return res.status(200).json({
      success: true,
      updatedTaskId: masterTaskId,
      tapCount: nextCount,
      status: "Tapped"
    });

  } catch (err) {
    console.error("ClickUp update error:", err.response?.data || err.message);
    return res.status(500).json({ error: "ClickUp update failed", detail: err.response?.data || err.message });
  }
}
  

app.post("/nfc", handleNfc);
app.post("/nfc-webhook", handleNfc);

// ✅ add GET so browser/NFC URL tests work
app.get("/nfc", handleNfc);
app.get("/nfc-webhook", handleNfc);

const PORT = process.env.PORT || 3000;   
// --- ClickUp helper routes (temporary for setup) ---

app.get("/clickup/fields", async (req, res) => {
  try {
    const r = await axios.get(
      `https://api.clickup.com/api/v2/list/${process.env.CLICKUP_LIST_ID}/field`,
      { headers: { Authorization: process.env.CLICKUP_API_TOKEN } }
    );
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.get("/clickup/task/:taskId", async (req, res) => {
  try {
    const r = await axios.get(
      `https://api.clickup.com/api/v2/task/${req.params.taskId}`,
      { headers: { Authorization: process.env.CLICKUP_API_TOKEN } }
    );
    res.json({ ok: true, id: r.data.id, name: r.data.name, custom_fields: r.data.custom_fields });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.response?.data || e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

