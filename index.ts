import "dotenv/config";
import express from "express";
import { registerRoutes } from "./routes";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

registerRoutes(app);

const port = parseInt(process.env.PORT || "4000", 10);
app.listen({ port, host: "0.0.0.0" }, () => {
  console.log(`Analyses service running on port ${port}`);
});
