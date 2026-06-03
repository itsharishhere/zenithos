import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./server/db.js"; // Note: .js for ESM compatibility or typescript resolution
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Enable JSON bodies with limit for signatures
app.use(express.json({ limit: "10mb" }));

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    console.log("Gemini client successfully initialized server-side.");
  } else {
    console.warn("GEMINI_API_KEY is not defined in environment variables.");
  }
} catch (e) {
  console.error("Failed to initialize Gemini Client:", e);
}

// ---------------- API ROUTES ----------------

// USER PROTOCOL & BILLING PLAN
app.get("/api/user", (req, res) => {
  let user = db.getUsers()[0];
  if (!user) {
    user = db.updateUserPlan("demo-user", "pro");
  }
  res.json(user);
});

app.patch("/api/user", (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "User name is required." });
  }
  const user = db.updateUser("demo-user", { name });
  if (!user) {
    return res.status(404).json({ error: "User profile not found." });
  }
  res.json(user);
});

app.post("/api/user/plan", (req, res) => {
  const { plan } = req.body;
  if (plan !== "free" && plan !== "pro") {
    return res.status(400).json({ error: "Invalid plan type. Must be 'free' or 'pro'." });
  }
  const user = db.updateUserPlan("demo-user", plan);
  res.json(user);
});

// INVOICES
app.get("/api/invoices", (req, res) => {
  res.json(db.getInvoices());
});

app.post("/api/invoices", (req, res) => {
  const { invoiceNumber, clientId, issueDate, dueDate, items, isGSTEligible, gstRate, gstRegisteredNumber, discount, status } = req.body;
  if (!invoiceNumber || !clientId || !issueDate || !dueDate || !items) {
    return res.status(400).json({ error: "Missing required invoice details." });
  }
  const invoice = db.createInvoice({
    invoiceNumber,
    clientId,
    issueDate,
    dueDate,
    items,
    isGSTEligible: !!isGSTEligible,
    gstRate: Number(gstRate) || 0,
    gstRegisteredNumber: gstRegisteredNumber || "",
    discount: Number(discount) || 0,
    status: status || "draft",
  });
  res.status(201).json(invoice);
});

app.patch("/api/invoices/:id", (req, res) => {
  const { id } = req.params;
  const updated = db.updateInvoice(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: "Invoice not found." });
  }
  res.json(updated);
});

app.delete("/api/invoices/:id", (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteInvoice(id);
  if (!deleted) {
    return res.status(404).json({ error: "Invoice not found to delete." });
  }
  res.json({ success: true });
});

// CLIENTS
app.get("/api/clients", (req, res) => {
  res.json(db.getClients());
});

app.post("/api/clients", (req, res) => {
  const { name, email, phone, company, onboardingData } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Client name and email are mandatory." });
  }
  const client = db.createClient({
    name,
    email,
    phone,
    company,
    status: "active",
    onboardingData,
  });
  res.status(201).json(client);
});

app.patch("/api/clients/:id", (req, res) => {
  const { id } = req.params;
  const updated = db.updateClient(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: "Client not found." });
  }
  res.json(updated);
});

app.delete("/api/clients/:id", (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteClient(id);
  if (!deleted) {
    return res.status(404).json({ error: "Client not found." });
  }
  res.json({ success: true });
});

// PROJECTS
app.get("/api/projects", (req, res) => {
  res.json(db.getProjects());
});

app.post("/api/projects", (req, res) => {
  const { title, description, clientId, milestones } = req.body;
  if (!title || !clientId) {
    return res.status(400).json({ error: "Title and clientId are required." });
  }
  const newProj = db.createProject({
    title,
    description,
    clientId,
    status: "active",
    milestones: milestones || [],
  });
  res.status(201).json(newProj);
});

app.patch("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const updated = db.updateProject(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: "Project not found." });
  }
  res.json(updated);
});

app.delete("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteProject(id);
  if (!deleted) {
    return res.status(404).json({ error: "Project not found." });
  }
  res.json({ success: true });
});

// CONTRACTS
app.get("/api/contracts", (req, res) => {
  res.json(db.getContracts());
});

app.get("/api/contracts/:id", (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "Contract not found." });
  res.json(contract);
});

app.post("/api/contracts", (req, res) => {
  const { title, body, variables, clientId } = req.body;
  if (!title || !body || !clientId) {
    return res.status(400).json({ error: "Title, body, and clientId are mandatory." });
  }
  const ctr = db.createContract({
    title,
    body,
    variables,
    clientId,
  });
  res.status(201).json(ctr);
});

app.post("/api/contracts/:id/sign", (req, res) => {
  const { id } = req.params;
  const { signatureData } = req.body;
  if (!signatureData) {
    return res.status(400).json({ error: "Signature data image is required." });
  }
  const signed = db.signContract(id, signatureData);
  if (!signed) return res.status(404).json({ error: "Contract not found." });
  res.json(signed);
});

app.patch("/api/contracts/:id", (req, res) => {
  const { id } = req.params;
  const updated = db.updateContract(id, req.body);
  if (!updated) return res.status(404).json({ error: "Contract not found." });
  res.json(updated);
});

app.delete("/api/contracts/:id", (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteContract(id);
  if (!deleted) return res.status(404).json({ error: "Contract not found." });
  res.json({ success: true });
});

// EMAIL TEMPLATES
app.get("/api/email-templates", (req, res) => {
  res.json(db.getEmailTemplates());
});

app.post("/api/email-templates", (req, res) => {
  const { name, subject, body, category } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: "Template library fields (name, subject, body) are required." });
  }
  const tmpl = db.createEmailTemplate({
    name,
    subject,
    body,
    category: category || "general",
  });
  res.status(201).json(tmpl);
});

app.patch("/api/email-templates/:id", (req, res) => {
  const updated = db.updateEmailTemplate(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Template not found." });
  res.json(updated);
});

app.delete("/api/email-templates/:id", (req, res) => {
  const deleted = db.deleteEmailTemplate(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Template not found." });
  res.json({ success: true });
});

app.post("/api/email-templates/send", (req, res) => {
  const { templateId, clientId, variables } = req.body;
  if (!templateId || !clientId) {
    return res.status(400).json({ error: "Template ID and Client ID are required." });
  }
  const template = db.getEmailTemplate(templateId);
  const client = db.getClient(clientId);
  if (!template || !client) {
    return res.status(404).json({ error: "Template or client not found." });
  }

  // Simulate rendering of the variables
  let renderedSubject = template.subject;
  let renderedBody = template.body;

  if (variables) {
    Object.entries(variables).forEach(([key, val]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      renderedSubject = renderedSubject.replace(regex, String(val));
      renderedBody = renderedBody.replace(regex, String(val));
    });
  }

  // Append free-tier branding if user is free
  const user = db.getUsers()[0];
  if (user && user.plan === "free") {
    renderedBody += `<p style="margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px;">Sent via ClientOS Free — upgrade to remove branding</p>`;
  }

  // Record activity
  db.addActivity("email_sent", `Sent email template '${template.name}' to ${client.name} (${client.email}).`);

  res.json({
    success: true,
    message: "Email successfully delivered via ClientOS SMTP Dispatch Node.",
    recipient: client.email,
    subject: renderedSubject,
    body: renderedBody,
  });
});

// LEADS
app.get("/api/leads", (req, res) => {
  res.json(db.getLeads());
});

app.post("/api/leads", (req, res) => {
  const { name, email, company, source, notes, stage } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Lead name and email are required." });
  }
  const lead = db.createLead({
    name,
    email,
    company,
    source: source || "Direct Request",
    stage: stage || "new",
    notes,
  });
  res.status(201).json(lead);
});

app.patch("/api/leads/:id", (req, res) => {
  const updated = db.updateLead(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Lead not found." });
  res.json(updated);
});

app.delete("/api/leads/:id", (req, res) => {
  const deleted = db.deleteLead(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Lead not found." });
  res.json({ success: true });
});

// ACTIVITIES
app.get("/api/activities", (req, res) => {
  res.json(db.getActivities());
});

app.delete("/api/activities", (req, res) => {
  db.clearActivities();
  res.json({ success: true, activities: db.getActivities() });
});

// AI COPY GENERATION ENDPOINT (PRO-GATED)
app.post("/api/ai/copy", async (req, res) => {
  const { offer, audience, tone, type } = req.body;

  // Plan verification: Pro Required!
  const user = db.getUsers()[0];
  if (!user || user.plan !== "pro") {
    return res.status(403).json({
      error: "Pro tier subscription required.",
      upgrade: true,
    });
  }

  if (!offer || !audience || !tone || !type) {
    return res.status(400).json({ error: "Offer description, target audience, tone, and output type are required." });
  }

  if (!ai) {
    // Elegant fallback mock if Gemini API Key is missing so the user can still preview features!
    console.warn("AI copy generator fallback active - GEMINI_API_KEY omitted");
    const fallbackVariants = [
      `[VARIANT 1 - ${tone.toUpperCase()}]\nGet ready to revolutionize your workflow! Our offer "${offer}" specifically answers the needs of ${audience}. Join now and scale standard performance instantly!`,
      `[VARIANT 2 - ${tone.toUpperCase()}]\nAre you tired of typical limitations? With "${offer}", designed exclusively for ${audience}, you unlock elite operational output starting today. Let's build your future.`,
      `[VARIANT 3 - ${tone.toUpperCase()}]\nCraft professional experiences with "${offer}". We help ${audience} maximize business efficiency, streamline onboarding, and drive outstanding strategic value safely.`
    ];
    return res.json({ variants: fallbackVariants });
  }

  try {
    const prompt = `You are a professional conversion copywriter writing copy for a freelance service or agency platform.
Develop exactly 3 high-performance marketing copy variants for the following parameters:
- Product/Service Offer: ${offer}
- Target Audience: ${audience}
- Copy Tone: ${tone} (e.g. Professional, Friendly, Urgent, Luxury, Tech, or Bold)
- Content Type Format: ${type} (e.g. Landing page header, Cold email, Proposal intro, Social post or Ad copy)

Your response MUST consist ONLY of the three variants, separated EXACTLY by the delimiter string "---VARIANT---". Do not output introductory text, do not repeat the fields, and do not number them. Output exactly:
[Variant 1 Text]
---VARIANT---
[Variant 2 Text]
---VARIANT---
[Variant 3 Text]`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.8,
        systemInstruction: "You are an elite copywriting assistant. You output crisp, engaging, conversion-optimized growth copy. Always separate copy blocks using ---VARIANT--- without any extra descriptions.",
      }
    });

    const resultText = response.text || "";
    const variants = resultText.split("---VARIANT---").map((v) => v.trim()).filter((v) => v.length > 0);

    // Ensure we have exactly 3 variants
    while (variants.length < 3) {
      variants.push(`[Fallback Copy Variant] Experience the dynamic leverage of "${offer}" crafted for ${audience}.`);
    }

    res.json({ variants: variants.slice(0, 3) });
  } catch (err: any) {
    console.error("AI Copy Generation error:", err);
    res.status(500).json({ error: "AI Dispatch failure: " + err.message });
  }
});


// ---------------- SERVER & VITE PLAYGROUND MIDDLEWARE ----------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Loading Vite Dev Mode server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Loading Production Static Server assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClientOS application running live on http://localhost:${PORT}`);
  });
}

startServer();
