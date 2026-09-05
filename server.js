import express from "express";
import nodemailer from "nodemailer";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

const LIMITS = { name: 100, email: 200, message: 3000 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple in-memory rate limit: max submissions per IP within a rolling window.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const submissions = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (submissions.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  submissions.set(ip, recent);
  if (recent.length >= RATE_MAX) return true;
  recent.push(now);
  return false;
}

async function readMessages() {
  try {
    const raw = await fs.readFile(MESSAGES_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function saveMessage(entry) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const messages = await readMessages();
  messages.push(entry);
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function buildMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: SMTP_SECURE !== "false",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const mailer = buildMailer();
const contactTo = process.env.CONTACT_TO || process.env.SMTP_USER;

async function sendNotification(entry) {
  if (!mailer || !contactTo) return false;
  await mailer.sendMail({
    from: `"Website contact form" <${process.env.SMTP_USER}>`,
    to: contactTo,
    replyTo: entry.email,
    subject: `New message from ${entry.name}`,
    text: `Name: ${entry.name}\nEmail: ${entry.email}\nReceived: ${entry.receivedAt}\n\n${entry.message}`,
  });
  return true;
}

function validateContact(body) {
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!name || !email || !message) {
    return { error: "Please fill in your name, email, and message." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (name.length > LIMITS.name || email.length > LIMITS.email || message.length > LIMITS.message) {
    return { error: "Your message is too long. Please shorten it and try again." };
  }
  return { value: { name, email, message } };
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, emailEnabled: Boolean(mailer) });
});

app.post("/api/contact", async (req, res) => {
  // Honeypot field: real users never fill it, bots usually do.
  if (req.body.website) {
    return res.status(200).json({ ok: true });
  }

  if (isRateLimited(req.ip)) {
    return res.status(429).json({ ok: false, error: "Too many messages. Please try again later." });
  }

  const { error, value } = validateContact(req.body);
  if (error) {
    return res.status(400).json({ ok: false, error });
  }

  const entry = {
    id: randomUUID(),
    ...value,
    receivedAt: new Date().toISOString(),
    emailed: false,
  };

  try {
    entry.emailed = await sendNotification(entry);
  } catch (err) {
    console.error("Failed to send notification email:", err.message);
  }

  try {
    await saveMessage(entry);
  } catch (err) {
    console.error("Failed to store message:", err);
    if (!entry.emailed) {
      return res.status(500).json({ ok: false, error: "Sorry, something went wrong. Please try again later." });
    }
  }

  res.status(201).json({ ok: true });
});

app.get("/api/messages", async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  const provided = req.get("authorization")?.replace(/^Bearer\s+/i, "") || req.query.token;
  if (!token || provided !== token) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  const messages = await readMessages();
  res.json({ ok: true, count: messages.length, messages: messages.slice().reverse() });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(400).json({ ok: false, error: "Invalid request." });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: "Server error." });
});

app.listen(PORT, () => {
  console.log(`Website running at http://localhost:${PORT}`);
  console.log(mailer ? `Email notifications enabled -> ${contactTo}` : "Email notifications disabled (SMTP not configured); messages are stored in data/messages.json");
});
