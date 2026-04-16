const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const api = require('./routes/index');

app.use('/api', api);

app.listen(PORT, () => {
  console.log(`Server running in http://localhost:${PORT}`);
});