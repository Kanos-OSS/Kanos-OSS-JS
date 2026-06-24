# Kanos Pricing API

AI-powered product pricing analysis service. Base URL: `http://localhost:4000`

---

## Endpoints

### `GET /api/analyses`

List all analyses.

**Response `200`**
```json
[
  {
    "id": 1,
    "productInput": "NY Strip Steak",
    "productName": "NY Strip Steak (Steakhouse Entrée)",
    "productCategory": "Fine Dining / Steakhouse",
    "businessType": "in_person",
    "businessLocation": "Brooklyn, NY",
    "status": "completed",
    "currentPrice": 38.00,
    "optimalPrice": 42.99,
    "marketAverage": 41.50,
    "revenueImpact": "+13%",
    "profitImpact": "+18%",
    "marketPosition": "Mid-range",
    "createdAt": "2026-06-24T10:00:00.000Z"
  }
]
```

---

### `GET /api/analyses/:id`

Get a single analysis by ID.

**Response `200`** — full analysis object (see POST response below)

**Response `404`**
```json
{ "message": "Analysis not found" }
```

---

### `POST /api/analyses`

Create and run a new analysis. **Synchronous** — blocks until the full AI pipeline completes.

Accepts `multipart/form-data` (required if uploading files) or `application/x-www-form-urlencoded`.

**Request fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `productInput` | string | Yes | Product name, URL, or description |
| `businessType` | string | No | `"online"` (default) or `"in_person"` |
| `businessLocation` | string | No | City/address — used for local competitor research |
| `currentPrice` | number | No* | Your current price |
| `isNewProduct` | string | No* | `"true"` if no current price exists |
| `files[]` | file(s) | No | Up to 10 files (CSV, XLSX, PDF, images, etc.) |

\* One of `currentPrice` or `isNewProduct=true` is required.

**Example (online product)**
```bash
curl -X POST http://localhost:4000/api/analyses \
  -F "productInput=Wireless Noise-Cancelling Headphones" \
  -F "businessType=online" \
  -F "currentPrice=79.99"
```

**Example (local business with file upload)**
```bash
curl -X POST http://localhost:4000/api/analyses \
  -F "productInput=Espresso" \
  -F "businessType=in_person" \
  -F "businessLocation=Austin, TX" \
  -F "currentPrice=4.50" \
  -F "files[]=@sales_data.csv"
```

**Example (new product, no current price)**
```bash
curl -X POST http://localhost:4000/api/analyses \
  -F "productInput=Handmade Soy Candles" \
  -F "businessType=online" \
  -F "isNewProduct=true"
```

**Response `200`**
```json
{
  "id": 7,
  "productInput": "Wireless Noise-Cancelling Headphones",
  "productName": "Wireless Noise-Cancelling Headphones (Online Retail)",
  "productCategory": "Consumer Electronics / Audio",
  "businessType": "online",
  "businessLocation": null,
  "status": "completed",
  "currentPrice": 79.99,
  "optimalPrice": 89.99,
  "marketAverage": 94.50,
  "revenueImpact": "+12%",
  "profitImpact": "+19%",
  "marketPosition": "Budget",
  "summary": "This is a budget-tier wireless headphone competing in a crowded $80–$150 online market. At $79.99 the product is underpriced relative to perceived value and leaves margin on the table. Raising to $89.99 targets the sweet spot where demand stays strong but profit per unit climbs significantly.",
  "keyInsight": "Strategy: Competitive + Psychological. Shoppers anchor to the $99 psychological threshold — positioning at $89.99 reads as 'premium but not expensive' and outperforms both $79.99 and $99.99 in A/B conversion tests for this category.",
  "recommendedAction": "1. Change price to $89.99 immediately.\n2. Add a crossed-out 'Was $99.99' anchor on the product page.\n3. Bundle with a carrying case ($5 cost) to justify the increase.\n4. Monitor cart abandonment rate for 2 weeks.\n5. Re-evaluate if conversion drops more than 8%.",
  "pricingStrategy": "Competitive + Psychological",
  "pricingRationale": "The market average sits at $94.50. Pricing at $89.99 undercuts the average by 5% while being $10 above the current price, improving margin without sacrificing competitiveness.",
  "competitors": [
    {
      "name": "Anker Soundcore Q45",
      "price": 79.99,
      "discount": "10% off",
      "availability": "In Stock",
      "rating": "4.4/5",
      "reviewCount": "12,400 reviews"
    },
    {
      "name": "Sony WH-CH720N",
      "price": 99.99,
      "discount": null,
      "availability": "In Stock",
      "rating": "4.5/5",
      "reviewCount": "8,900 reviews"
    }
  ],
  "localCompetitors": null,
  "customerPersona": {
    "who": "Remote workers and commuters aged 25–40 seeking affordable noise cancellation for open offices and public transit. They research on YouTube and Reddit before buying.",
    "ageRange": "25–40 years old",
    "whyTheyBuy": "Block out distractions and improve focus without spending $300+ on Sony/Bose",
    "whatTheyCareMost": "ANC quality and battery life per dollar",
    "typicalBudget": "$60–$120",
    "whereTheyShop": "Amazon, Best Buy, brand website",
    "priceSensitivity": "medium"
  },
  "demandSignals": {
    "trend": "Noise-cancelling headphones grew 14% YoY in the sub-$100 segment as remote work normalized. Search volume for 'budget anc headphones' is up 22% over the past 12 months.",
    "trendDirection": "up",
    "trendPercentage": 14,
    "seasonality": "Peak demand in Nov–Dec (holiday gifting) and Aug–Sep (back to school). Slowest in Feb–Mar.",
    "searchVolume": "~90,000 monthly searches (US)",
    "priceVolatility": "Prices fluctuate 10–20% around Prime Day and Black Friday; otherwise stable."
  },
  "priceSimulation": [
    { "price": 55.99, "expectedDemand": 180, "expectedRevenue": 10078, "expectedProfit": 2016 },
    { "price": 62.99, "expectedDemand": 165, "expectedRevenue": 10393, "expectedProfit": 2600 },
    { "price": 69.99, "expectedDemand": 148, "expectedRevenue": 10359, "expectedProfit": 3108 },
    { "price": 79.99, "expectedDemand": 130, "expectedRevenue": 10399, "expectedProfit": 3640 },
    { "price": 84.99, "expectedDemand": 122, "expectedRevenue": 10369, "expectedProfit": 3904 },
    { "price": 89.99, "expectedDemand": 115, "expectedRevenue": 10349, "expectedProfit": 4140 },
    { "price": 94.99, "expectedDemand": 105, "expectedRevenue": 9974, "expectedProfit": 3990 },
    { "price": 99.99, "expectedDemand": 92, "expectedRevenue": 9199, "expectedProfit": 3588 },
    { "price": 109.99, "expectedDemand": 72, "expectedRevenue": 7919, "expectedProfit": 2877 },
    { "price": 119.99, "expectedDemand": 50, "expectedRevenue": 5999, "expectedProfit": 1800 }
  ],
  "webResearchSummary": "...",
  "internalDataSummary": null,
  "hasInternalData": 0,
  "createdAt": "2026-06-24T10:05:33.000Z"
}
```

**Response `400`**
```json
{ "message": "Product URL or name is required" }
{ "message": "Provide your current price or mark this as a new product." }
```

**Response `500`**
```json
{ "message": "Analysis failed to complete" }
```

---

### `DELETE /api/analyses/:id`

Delete an analysis.

**Response `204`** — no body

**Response `500`**
```json
{ "message": "Failed to delete analysis" }
```

---

### `POST /api/analyses/:id/retry`

Re-run a failed analysis (uses original inputs stored in the database; uploaded files are not re-sent).

**Response `200`** — same full analysis object as POST

**Response `400`**
```json
{ "message": "Only failed analyses can be retried" }
```

**Response `404`**
```json
{ "message": "Analysis not found" }
```

---

## Analysis Status Flow

```
pending → analyzing → extracting_data* → researching_market → researching_local* → analyzing_market → completed
                                                                                                     ↘ failed
```

\* `extracting_data` only appears when files are uploaded; `researching_local` only appears for `in_person` businesses.

---

## Supported Upload File Types

| Type | Handling |
|---|---|
| `.csv`, `.txt` | Raw text extracted (up to 10,000 chars) |
| `.xlsx`, `.xls` | Filename + size noted |
| `.pdf`, `.doc`, `.docx` | Filename + size noted |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` | Vision AI extracts pricing/sales data |

Max 10 files, 50 MB per file.
