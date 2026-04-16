import { DataTypes } from "sequelize";
import { sequelize } from "./connect.js";

const Lego = sequelize.define(
  "Lego",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    pieza: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    lego: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    cantidad: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    task: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    set_nombre: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    esta_pedido: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    esta_reemplazado: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    esta_completo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    comentarios: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "legos",
    timestamps: false,
  }
);

export { Lego };