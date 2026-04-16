import express from "express";
import cors from "cors";
import api from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", api);

export default app;