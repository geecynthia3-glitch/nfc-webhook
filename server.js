require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const EVENTS_FILE = path.join(__dirname, "events.json");

function loadEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return {};
  return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
}

function saveEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

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

app.get("/health/env", (req, res) => {
  res.json({
    ok: true,
    has: {
      CLICKUP_EVENT_TASK_ID: !!process.env.CLICKUP_EVENT_TASK_ID,
      CLICKUP_TAP_COUNT_FIELD_ID: !!process.env.CLICKUP_TAP_COUNT_FIELD_ID,
      CLICKUP_STATUS_FIELD_ID: !!process.env.CLICKUP_STATUS_FIELD_ID
    }
  });
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
    const eid = req.query.eid;
if (!eid) {
  return res.status(400).json({ error: "Missing eid in URL. Example: ?eid=SMITH-WED-2026" });
}

const events = loadEvents();
const event = events[eid];

if (!event || !event.clickupTaskId) {
  return res.status(404).json({
    error: "Unknown eid. Create the event first using /event/create",
    eid
  });
}

const masterTaskId = event.clickupTaskId;

    const tapFieldId = process.env.CLICKUP_TAP_COUNT_FIELD_ID;
    const statusFieldId = process.env.CLICKUP_STATUS_FIELD_ID;

    if (!tapFieldId || !statusFieldId) {
  return res.status(500).json({
    error: "Missing required env vars",
    missing: {
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

app.post("/event/create", (req, res) => {
  const providedKey = req.query.key;
if (process.env.WEBHOOK_SECRET && providedKey !== process.env.WEBHOOK_SECRET) {
  return res.status(401).json({ error: "Unauthorized" });
}

  const { eventId, planner, eventName, clickupTaskId } = req.body;

  if (!eventId || !clickupTaskId) {
    return res.status(400).json({
      error: "eventId and clickupTaskId are required"
    });
  }

  const events = loadEvents();

  events[eventId] = {
    planner: planner || "Unknown Planner",
    eventName: eventName || "Untitled Event",
    clickupTaskId
  };

  saveEvents(events);

  res.json({
    success: true,
    eventId,
    stored: events[eventId]
  });
});

app.get("/event/list", (req, res) => {
  res.json(loadEvents());
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

