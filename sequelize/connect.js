import { Sequelize } from "sequelize";

// ⚠️ dotenv solo en local
if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: {
    connectTimeout: 30000,
  },
  pool: {
    max: 1,        // 👈 clave para Vercel
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export { sequelize };