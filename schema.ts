import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  productInput: text("product_input").notNull(),
  productName: text("product_name"),
  productCategory: text("product_category"),
  businessType: text("business_type").$type<"online" | "in_person">(),
  businessLocation: text("business_location"),
  status: text("status").notNull().default("pending"),
  currentPrice: real("current_price"),
  optimalPrice: real("optimal_price"),
  marketAverage: real("market_average"),
  revenueImpact: text("revenue_impact"),
  profitImpact: text("profit_impact"),
  marketPosition: text("market_position"),
  summary: text("summary"),
  keyInsight: text("key_insight"),
  recommendedAction: text("recommended_action"),
  competitors: jsonb("competitors").$type<CompetitorData[]>(),
  localCompetitors: jsonb("local_competitors").$type<LocalCompetitor[]>(),
  demandSignals: jsonb("demand_signals").$type<DemandSignal>(),
  priceSimulation: jsonb("price_simulation").$type<PriceSimulationPoint[]>(),
  customerPersona: jsonb("customer_persona").$type<CustomerPersona>(),
  webResearchSummary: text("web_research_summary"),
  internalDataSummary: text("internal_data_summary"),
  hasInternalData: integer("has_internal_data").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({
  id: true,
  createdAt: true,
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;

export interface CompetitorData {
  name: string;
  price: number;
  discount?: string;
  availability?: string;
  url?: string;
  address?: string;
  distance?: string;
  rating?: string;
  reviewCount?: string;
}

export interface LocalCompetitor {
  name: string;
  address: string;
  distance?: string;
  priceRange?: string;
  rating?: string;
  reviewCount?: string;
  type?: string;
}

export interface DemandSignal {
  trend: string;
  trendDirection: "up" | "down" | "stable";
  trendPercentage: number;
  seasonality: string;
  searchVolume: string;
  priceVolatility: string;
}

export interface PriceSimulationPoint {
  price: number;
  expectedDemand: number;
  expectedRevenue: number;
  expectedProfit: number;
}

export interface CustomerPersona {
  who: string;
  ageRange: string;
  whyTheyBuy: string;
  whatTheyCareMost: string;
  typicalBudget: string;
  whereTheyShop: string;
  priceSensitivity: "low" | "medium" | "high";
}
