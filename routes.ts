import type { Express } from "express";
import { storage } from "./storage";
import { minimaxAI, replicAI, AI_MODEL } from "./openai";
import { deepResearch } from "./web-research";
import type { CompetitorData, CustomerPersona, DemandSignal, LocalCompetitor, PriceSimulationPoint } from "./schema";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function registerRoutes(app: Express) {
  // GET all analyses
  app.get("/api/analyses", async (_req, res) => {
    try {
      const analyses = await storage.getAllAnalyses();
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching analyses:", error);
      res.status(500).json({ message: "Failed to fetch analyses" });
    }
  });

  // GET single analysis
  app.get("/api/analyses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getAnalysis(id);
      if (!analysis) return res.status(404).json({ message: "Analysis not found" });
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ message: "Failed to fetch analysis" });
    }
  });

  // POST create + run analysis (synchronous — returns full result when done)
  app.post("/api/analyses", upload.array("files", 10), async (req, res) => {
    try {
      const { productInput, businessType, businessLocation, currentPrice, isNewProduct } = req.body;
      if (!productInput || !productInput.trim()) {
        return res.status(400).json({ message: "Product URL or name is required" });
      }

      const files = req.files as Express.Multer.File[] | undefined;
      const newProduct = isNewProduct === "true";
      const parsedPrice = currentPrice !== undefined && currentPrice !== "" ? parseFloat(currentPrice) : null;
      const validPrice = parsedPrice !== null && Number.isFinite(parsedPrice) && parsedPrice >= 0;

      if (!newProduct && !validPrice) {
        return res.status(400).json({ message: "Provide your current price or mark this as a new product." });
      }

      const userPrice = newProduct ? null : (validPrice ? parsedPrice : null);

      const analysis = await storage.createAnalysis({
        productInput: productInput.trim(),
        businessType: businessType || "online",
        businessLocation: businessLocation?.trim() || null,
        status: "analyzing",
        hasInternalData: files && files.length > 0 ? 1 : 0,
        currentPrice: userPrice,
      });

      await runAnalysis(analysis.id, productInput.trim(), files || [], {
        businessType: businessType || "online",
        businessLocation: businessLocation?.trim() || null,
        userCurrentPrice: userPrice,
        isNewProduct: newProduct,
      });

      const result = await storage.getAnalysis(analysis.id);
      if (!result || result.status === "failed") {
        return res.status(500).json({ message: "Analysis failed to complete" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error creating analysis:", error);
      res.status(500).json({ message: "Failed to create analysis" });
    }
  });

  // DELETE analysis
  app.delete("/api/analyses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAnalysis(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting analysis:", error);
      res.status(500).json({ message: "Failed to delete analysis" });
    }
  });

  // POST retry a failed analysis
  app.post("/api/analyses/:id/retry", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getAnalysis(id);
      if (!analysis) return res.status(404).json({ message: "Analysis not found" });
      if (analysis.status !== "failed") return res.status(400).json({ message: "Only failed analyses can be retried" });

      await storage.updateAnalysis(id, { status: "analyzing" });

      const storedPrice = analysis.currentPrice != null ? Number(analysis.currentPrice) : null;
      await runAnalysis(id, analysis.productInput, [], {
        businessType: (analysis.businessType as "online" | "in_person") || "online",
        businessLocation: analysis.businessLocation || null,
        userCurrentPrice: storedPrice,
        isNewProduct: storedPrice === null,
      });

      const result = await storage.getAnalysis(id);
      if (!result || result.status === "failed") {
        return res.status(500).json({ message: "Retry failed" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error retrying analysis:", error);
      res.status(500).json({ message: "Failed to retry analysis" });
    }
  });
}

interface AnalysisOptions {
  businessType?: "online" | "in_person";
  businessLocation?: string | null;
  userCurrentPrice?: number | null;
  isNewProduct?: boolean;
}

async function runAnalysis(
  analysisId: number,
  productInput: string,
  files: Express.Multer.File[],
  options: AnalysisOptions = {}
) {
  const { businessType = "online", businessLocation = null, userCurrentPrice = null, isNewProduct = false } = options;
  let internalDataContext = "";
  let webResearchContext = "";
  let localResearchContext = "";

  if (files.length > 0) {
    await storage.updateAnalysis(analysisId, { status: "extracting_data" });
    internalDataContext = await extractInternalData(files);
    await storage.updateAnalysis(analysisId, { internalDataSummary: internalDataContext });
  }

  await storage.updateAnalysis(analysisId, { status: "researching_market" });

  try {
    const research = await deepResearch(productInput, businessType, businessLocation);
    webResearchContext = research.webSummary;
    localResearchContext = research.localSummary;
    if (webResearchContext) {
      await storage.updateAnalysis(analysisId, { webResearchSummary: webResearchContext });
    }
    if (localResearchContext) {
      await storage.updateAnalysis(analysisId, { status: "researching_local" });
    }
  } catch (err) {
    console.error("[Analysis] Research failed, continuing with AI knowledge:", err);
  }

  await storage.updateAnalysis(analysisId, { status: "analyzing_market" });

  const isInPerson = businessType === "in_person";
  const locationContext = isInPerson && businessLocation
    ? `\nBusiness Location: ${businessLocation}\nThis is a LOCAL/IN-PERSON business. Focus on local market dynamics, foot traffic, neighborhood demographics, and nearby competitors.`
    : "";

  const localCompetitorInstruction = isInPerson
    ? `
  "localCompetitors": [
    {"name": "Nearby Business Name", "address": "123 Main St, City", "distance": "0.3 miles", "priceRange": "$15-$25", "rating": "4.5/5", "reviewCount": "328 reviews", "type": "Direct competitor"},
    ... (3-8 nearby competitors with real addresses, distances, Google/Yelp ratings, and review counts)
  ],`
    : "";

  const localCompetitorNote = isInPerson
    ? `\nFor the localCompetitors array: find REAL nearby businesses that compete with this product/service in ${businessLocation}. Include their actual addresses, approximate distances, price ranges, and ratings. Think about what a customer walking around that area would see as alternatives.`
    : "";

  const userPriceContext = userCurrentPrice !== null && userCurrentPrice !== undefined
    ? `\nOwner's Current Price: $${userCurrentPrice.toFixed(2)} (PROVIDED BY THE OWNER — treat this as FACT, not an estimate. Use this exact number as the baseline for all comparisons, revenue/profit impact calculations, and price simulation.)`
    : isNewProduct
    ? `\nThis is a NEW PRODUCT with no current price yet. The owner is launching this for the first time and needs a launch price recommendation. Do NOT fabricate a "currentPrice" — set it to null. Focus your recommendation on what the FIRST price should be, with emphasis on market entry strategy.`
    : "";

  const competitorPrompt = `You are a senior pricing strategist with the depth of a McKinsey pricing consultant and the pragmatism of a Main Street business advisor. Your job: give the owner of this business the most ACCURATE, REALISTIC, and ACTIONABLE pricing recommendation possible.

Product/Business: ${productInput}
Business Type: ${isInPerson ? "In-Person / Local Business" : "Online / E-commerce"}${locationContext}${userPriceContext}

${webResearchContext ? `\n=== LIVE WEB RESEARCH DATA (PRIMARY SOURCE) ===\n${webResearchContext}\n=== END WEB RESEARCH ===` : ""}
${localResearchContext ? `\n=== LOCAL COMPETITOR RESEARCH ===\n${localResearchContext}\n=== END LOCAL RESEARCH ===` : ""}
${internalDataContext ? `\n=== OWNER'S INTERNAL BUSINESS DATA ===\n${internalDataContext}\n=== END INTERNAL DATA ===` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — CONTEXT RESOLUTION (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before pricing, determine EXACTLY what is being sold, by whom, in what channel, and to whom.
A vague input like "steak" has wildly different correct prices:
  • Steakhouse entrée (restaurant)  → $28–$65
  • Raw prime ribeye at a butcher   → $18–$40/lb
  • Frozen steak subscription box   → $12–$22/lb
  • Food truck steak sandwich       → $13–$18
  • Grocery store retail pack       → $8–$18/lb
Resolve the most likely interpretation based on the business type, location context, and wording.
State your interpretation clearly inside the "productName" and "productCategory" fields.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — PRICING FRAMEWORK SELECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Choose the RIGHT framework for this product/business. Apply it rigorously:

A. VALUE-BASED PRICING (best for premium, unique, or experience goods)
   → Price = what the customer believes it's worth, not what it costs
   → Signals: strong brand, differentiated quality, loyal repeat buyers
   → Typical markup: 60–200% above cost

B. COMPETITIVE PRICING (best for commoditized products)
   → Price = at, slightly below, or slightly above direct competitors
   → Use actual competitor prices from research as your anchor
   → Typical variance from market avg: ±5–20%

C. COST-PLUS PRICING (best for services, bespoke, or custom work)
   → Price = estimated cost × markup factor
   → Food/beverage: target 28–35% food cost ratio (price = cost ÷ 0.30)
   → Retail goods: 40–60% gross margin (price = cost ÷ 0.55)
   → Services: 50–70% margin after labor

D. PSYCHOLOGICAL PRICING (apply to ANY framework for conversion lift)
   → Use charm prices: $X.99, $X.95, $X.49 (not $X.00 unless luxury)
   → Anchor high: show a "was" price or premium tier first
   → Bundle: suggest "2 for $X" or add-on upsells in the action steps

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — REALITY-CHECK BEFORE OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before finalizing any price, verify ALL of the following:
✓ Is the optimalPrice within the known real-world range for this product category and channel?
✓ Would a real customer pay this without laughing or feeling ripped off?
✓ Are the competitor prices actually what real businesses charge? (not fabricated)
✓ Does the priceSimulation peak profit land AT or NEAR the optimalPrice? (if not, recalculate)
✓ Is the currentPrice a real estimate for what this type of business currently charges — not a placeholder?
✓ Are revenue/profit impact percentages computed correctly vs the currentPrice baseline?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — PRODUCE THE JSON OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY a valid JSON object — no commentary, no markdown, no code fences:
{
  "productName": "Specific product/business name — include channel context (e.g. 'NY Strip Steak (Steakhouse Entrée)' or 'NY Strip Steak (Butcher Retail, per lb)')",
  "productCategory": "Specific category including channel — e.g. 'Fine Dining / Steakhouse' not just 'Food'",
  "currentPrice": ${userCurrentPrice ? `${userCurrentPrice} (USE THE OWNER'S PROVIDED PRICE — do NOT change it)` : isNewProduct ? `null (new product — no current price exists yet)` : `typical current price for this type of business as a number (MUST be realistic)`},
  "pricingStrategy": "Value-Based" | "Competitive" | "Cost-Plus" | "Psychological" | "Competitive + Psychological",
  "pricingRationale": "2-3 sentences explaining WHY this specific price.",
  "competitors": [
    {"name": "Real Business or Brand Name", "price": 29.99, "discount": "10% off or null", "availability": "In Stock or Varies", "rating": "4.5/5", "reviewCount": "1,240 reviews"${isInPerson ? ', "address": "Full street address", "distance": "0.4 miles"' : ""}},
    ... (4-7 competitors)
  ],${localCompetitorInstruction}
  "customerPersona": {
    "who": "2 specific sentences about who buys this.",
    "ageRange": "XX–YY years old",
    "whyTheyBuy": "The core emotional and functional reason",
    "whatTheyCareMost": "The #1 decision factor",
    "typicalBudget": "Realistic budget range",
    "whereTheyShop": "Top channels",
    "priceSensitivity": "low" | "medium" | "high"
  },
  "demandSignals": {
    "trend": "Concrete 2-3 sentences with real data.",
    "trendDirection": "up" | "down" | "stable",
    "trendPercentage": realistic number,
    "seasonality": "Month-by-month or quarter-by-quarter pattern.",
    "searchVolume": "Realistic estimate with units",
    "priceVolatility": "How often and by how much do prices move?"
  },
  "marketAverage": weighted average of competitor prices as a number,
  "priceSimulation": [
    ... 10 price points spanning ±40% around the currentPrice.
    Each: {"price": X.XX, "expectedDemand": Y, "expectedRevenue": Z, "expectedProfit": W}
  ],
  "optimalPrice": the price point where expectedProfit is highest,
  "marketPosition": "Budget" | "Mid-range" | "Slightly Premium" | "Premium" | "Luxury",
  "revenueImpact": "+X%" or "-X%",
  "profitImpact": "+X%" or "-X%",
  "summary": "3 sentences covering what the product is, why current price is right or wrong, and what optimal price achieves.",
  "keyInsight": "Begin with 'Strategy: [name]'. Then the single most non-obvious pricing insight backed by data.",
  "recommendedAction": "Numbered step-by-step plan with exact price, framing, psychological tactic, what to monitor, and when to re-evaluate."
}${localCompetitorNote}`;

  try {
    const response = await minimaxAI.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: competitorPrompt }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(cleaned);

    await storage.updateAnalysis(analysisId, {
      status: "completed",
      productName: result.productName,
      productCategory: result.productCategory,
      currentPrice: isNewProduct ? null : (userCurrentPrice ?? result.currentPrice),
      optimalPrice: result.optimalPrice,
      marketAverage: result.marketAverage,
      revenueImpact: result.revenueImpact,
      profitImpact: result.profitImpact,
      marketPosition: result.marketPosition,
      summary: result.summary,
      keyInsight: result.keyInsight,
      recommendedAction: result.recommendedAction,
      competitors: result.competitors as CompetitorData[],
      localCompetitors: result.localCompetitors as LocalCompetitor[] || null,
      demandSignals: result.demandSignals as DemandSignal,
      priceSimulation: result.priceSimulation as PriceSimulationPoint[],
      customerPersona: result.customerPersona as CustomerPersona,
    });
  } catch (error) {
    console.error("AI analysis failed:", error);
    await storage.updateAnalysis(analysisId, { status: "failed" });
  }
}

async function extractInternalData(files: Express.Multer.File[]): Promise<string> {
  const summaries: string[] = [];

  for (const file of files) {
    const ext = file.originalname.split(".").pop()?.toLowerCase() || "";
    let fileContent = "";

    if (["csv", "txt"].includes(ext)) {
      fileContent = file.buffer.toString("utf-8").slice(0, 10000);
    } else if (["xlsx", "xls"].includes(ext)) {
      fileContent = `[Excel file: ${file.originalname}, ${(file.size / 1024).toFixed(1)}KB]`;
    } else if (["pdf", "doc", "docx"].includes(ext)) {
      fileContent = `[Document file: ${file.originalname}, ${(file.size / 1024).toFixed(1)}KB]`;
    } else if (["pptx", "ppt"].includes(ext)) {
      fileContent = `[Presentation file: ${file.originalname}, ${(file.size / 1024).toFixed(1)}KB]`;
    } else if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      try {
        const base64 = file.buffer.toString("base64");
        const visionResponse = await replicAI.chat.completions.create({
          model: "gpt-5.2",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Extract any pricing, sales, cost, or business data from this image. Look for price tags, charts, tables, or any numerical business information. Provide a structured summary." },
              { type: "image_url", image_url: { url: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${base64}` } },
            ],
          }],
        });
        fileContent = visionResponse.choices[0]?.message?.content || "Could not extract data from image";
      } catch {
        fileContent = `[Image file: ${file.originalname}]`;
      }
    } else {
      fileContent = file.buffer.toString("utf-8").slice(0, 5000);
    }

    if (fileContent) {
      summaries.push(`File: ${file.originalname}\n${fileContent}`);
    }
  }

  if (summaries.length === 0) return "";

  try {
    const extractResponse = await minimaxAI.chat.completions.create({
      model: AI_MODEL,
      messages: [{
        role: "user",
        content: `Extract and summarize all business-relevant data from these files. Focus on: pricing data, sales volumes, revenue, costs, margins, marketing positioning, target demographics, and any other business intelligence.\n\n${summaries.join("\n\n---\n\n")}`,
      }],
    });
    return extractResponse.choices[0]?.message?.content || summaries.join("\n");
  } catch {
    return summaries.join("\n");
  }
}
