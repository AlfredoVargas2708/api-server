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

router.post("/search", async (req, res) => {
  try {
    const { column, page, pageSize } = req.query;
    const { value, color_id, database_value } = req.body;

    if (!column || !value || !page || !pageSize) {
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });
    }

    if (column === "pieza" && !color_id && !database_value) {
      return res
        .status(400)
        .json({ message: "Faltan campos obligatorios", data: [] });
    }

    let apiResults = [];

    if (column === "lego") {
      const piezas = await piezasSetData(value);
      apiResults = piezas.results;
    } else if (column === "pieza") {
      const sets = await setsPiezaData(value, color_id);
      apiResults = sets.results;
    }

    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedPageSize = Math.max(1, parseInt(pageSize) || 10);
    const offset = (parsedPage - 1) * parsedPageSize;

    const results = await Lego.findAndCountAll({
      where: { [column]: column === "lego" ? value : database_value },
      order: [["id", "ASC"]],
      raw: true,
    });

    console.log(apiResults);
    console.log(results);

    let dataCombined = apiResults
      .map((obj) => {
        const encontrados = results.rows.filter((row) =>
          column === "lego"
            ? row.pieza === obj.element_id
            : row.lego === obj.set_num.replace("-1", ""),
        );

        return {
          ...obj,
          detalles: encontrados,
        };
      })
      .sort((a, b) => b.detalles.length - a.detalles.length)
      .slice(offset, offset + parsedPageSize);

    let allTexts = [];

    if (column === "lego") {
      allTexts = [
        ...dataCombined.map((dt) => dt.part.name),
        ...dataCombined.map((dt) => dt.color.name),
      ];
    } else {
      allTexts = dataCombined.map((dt) => dt.name);
    }

    const translations = await translateBatch(allTexts);

    const dataFinal = dataCombined.map((dt) => {
      if (column === "lego") {
        return {
          ...dt,
          part: {
            ...dt.part,
            name_translated: translations[dt.part?.name] || dt.part?.name,
          },
          color: {
            ...dt.color,
            name_translated: translations[dt.color?.name] || dt.color?.name,
          },
        };
      } else {
        return {
          ...dt,
          name_translated: translations[dt.name] || dt.name,
          set_num: dt.set_num.replace("-1", ""),
        };
      }
    });

    return res.status(200).json({
      message: "Elementos Encontrados",
      data: {
        count: apiResults.length,
        data: dataFinal,
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
    const { part, color_id } = req.query;

    if (!part || !color_id)
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
        data: rows,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

router.get("/piezas-set", async (req, res) => {
  try {
    const { value } = req.query;

    if (!value)
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
        data: rows,
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
