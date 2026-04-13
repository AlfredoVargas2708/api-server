const router = require("express").Router();
const { getInstruccions } = require("../brickset/index.js");
const {
  rebrickData,
  piezasSetData,
  setsPiezaData,
  piezasColorsData,
} = require("../rebirck/index.js");
const { Lego } = require("../sequelize/lego.model.js");
const { translation } = require("../translate/index.js");

// Cache simple en memoria (reemplazar por Redis en producción)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const getCached = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = (key, value) => {
  cache.set(key, { value, timestamp: Date.now() });
};

// Traducciones en batch para evitar llamadas secuenciales
const translateBatch = async (texts) => {
  const unique = [...new Set(texts)];
  const results = await Promise.all(unique.map((t) => translation(t)));
  return Object.fromEntries(unique.map((t, i) => [t, results[i]]));
};

// rebrickData con cache
const rebrickDataCached = async (type, id) => {
  const key = `rebrick:${type}:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await rebrickData(type, id);
  setCache(key, data);
  return data;
};

router.get("/value", async (req, res) => {
  try {
    const { column, value } = req.query;

    if (!column || !value) {
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });
    }

    const rebrickResponse = await rebrickDataCached(column, value);

    const name =
      column === "lego" ? rebrickResponse.name : rebrickResponse.part.name;
    const color = column === "lego" ? null : rebrickResponse.color.name;

    const [translatedName, translatedColor] = await Promise.all([
      translation(name),
      color ? translation(color) : Promise.resolve(null),
    ]);

    // Join unificado
    const data =
      column === "lego"
        ? {
            ...rebrickResponse,
            name_translated: translatedName,
          }
        : {
            ...rebrickResponse.part,
            name_translated: translatedName,
            color: {
              ...rebrickResponse.color,
              name_translated: translatedColor,
            },
            element_img_url: rebrickResponse.element_img_url,
            element_id: rebrickResponse.element_id,
          };

    res.status(200).json({ message: "Elemento encontrado", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor", data: [] });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { column, value, page, pageSize } = req.query;

    if (!column || !value || !page || !pageSize) {
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });
    }

    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedPageSize = Math.max(1, parseInt(pageSize) || 10);
    const offset = (parsedPage - 1) * parsedPageSize;

    const result = await Lego.findAndCountAll({
      where: { [column]: value },
      order: [["id", "ASC"]],
      limit: parsedPageSize,
      offset,
    });

    const legosSet = [...new Set(result.rows.map((r) => r.lego))].filter(
      Boolean,
    );
    const piezasSet = [...new Set(result.rows.map((r) => r.pieza))].filter(
      Boolean,
    );

    const [legosData, piezasData] = await Promise.all([
      Promise.all(legosSet.map((id) => rebrickDataCached("lego", id))),
      Promise.all(piezasSet.map((id) => rebrickDataCached("pieza", id))),
    ]);

    // Mapas para lookup O(1)
    const legosMap = Object.fromEntries(
      legosSet.map((id, i) => [id, legosData[i]]),
    );
    const piezasMap = Object.fromEntries(
      piezasSet.map((id, i) => [id, piezasData[i]]),
    );

    // Batch de traducciones
    const allTexts = [
      ...legosData.map((i) => i.name),
      ...piezasData.map((i) => i.part.name),
      ...piezasData.map((i) => i.color.name),
    ];
    const translations = await translateBatch(allTexts);

    // Join por fila
    const rows = result.rows.map((row) => {
      const lego = legosMap[row.lego];
      const pieza = piezasMap[row.pieza];

      return {
        ...row.dataValues,
        lego_detail: lego
          ? {
              ...lego,
              name_translated: translations[lego.name],
            }
          : null,
        pieza_detail: pieza
          ? {
              ...pieza.part,
              name_translated: translations[pieza.part.name],
              color: {
                ...pieza.color,
                name_translated: translations[pieza.color.name],
              },
              element_img_url: pieza.element_img_url,
            }
          : null,
      };
    });

    res.status(200).json({
      message: "Elemento encontrado",
      data: {
        count: result.count,
        rows,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor", data: [] });
  }
});

router.get("/instructions", async (req, res) => {
  try {
    const { value } = req.query;

    if (!value)
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });

    const mergedPdfBytes = await getInstruccions(value); // ✅ res vive acá

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="instructions-${value}.pdf"`,
    );
    res.send(Buffer.from(mergedPdfBytes));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor", data: [] });
  }
});

router.post("/agregar", async (req, res) => {
  try {
    const { data } = req.body;

    if (!data)
      return res
        .status(400)
        .json({ message: "Falta el elemento a agregar", data: [] });

    await Lego.create(data);

    return res.status(201).json({ message: "Elemento agregado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.put("/editar", async (req, res) => {
  try {
    const { data } = req.body;

    if (!data)
      return res.status(400).json({ message: "Falta el elemento a editar" });

    const { id, ...elemento } = data;

    await Lego.update(elemento, {
      where: {
        id: id,
      },
    });

    return res.status(201).json({ message: "Elemento editado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.delete("/eliminar", async (req, res) => {
  try {
    const { id } = req.query;

    if (!id)
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });

    await Lego.destroy({
      where: {
        id: id,
      },
    });

    return res
      .status(201)
      .json({ message: "Elemento eliminado correctamente" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/sets-pieza", async (req, res) => {
  try {
    const { part, color_id, page, pageSize } = req.query;

    if (!part || !color_id || !page || !pageSize)
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });

    const results = await setsPiezaData(part, color_id);

    const namesSet = [
      ...new Set(results.results.map((res) => res.name)),
    ].filter(Boolean);

    const translations = await translateBatch(namesSet);

    const rows = results.results.map((item) => {
      return {
        ...item,
        name_translated: translations[item.name] ?? item.name,
      };
    });

    return res.status(200).json({
      message: "Sets encontrados",
      data: {
        count: results.count,
        rows,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/piezas-set", async (req, res) => {
  try {
    const { value, page, pageSize } = req.query;

    if (!value || !page || !pageSize)
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });

    const results = await piezasSetData(value);

    // Sets únicos para no traducir duplicados
    const namesSet = [
      ...new Set(results.results.map((r) => r.part.name)),
    ].filter(Boolean);
    const colorsSet = [
      ...new Set(results.results.map((r) => r.color.name)),
    ].filter(Boolean);

    // Batch de traducciones (una sola llamada)
    const allTexts = [...namesSet, ...colorsSet];
    const translations = await translateBatch(allTexts);

    // Join por fila con traducciones
    const rows = results.results.map((item) => ({
      ...item,
      part: {
        ...item.part,
        name_translated: translations[item.part.name] ?? item.part.name,
      },
      color: {
        ...item.color,
        name_translated: translations[item.color.name] ?? item.color.name,
      },
    }));

    res.status(200).json({
      message: "Piezas encontradas",
      data: {
        count: results.count,
        rows,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/colors", async (req, res) => {
  try {
    const colors = await piezasColorsData();

    return res
      .status(200)
      .json({ message: "Colores encontrados", data: colors });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .send({ message: "Error interno del servidor", data: [] });
  }
});

module.exports = router;
