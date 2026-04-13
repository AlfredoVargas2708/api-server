require("dotenv").config();

const URL = process.env.BRICKSET_API_URL;
const KEY = process.env.BRICKSET_API_KEY;
const axios = require("axios");
const { PDFDocument } = require("pdf-lib"); // ✅ import faltante

const getInstruccions = async (value) => {
  const response = await axios.post(
    URL,
    new URLSearchParams({
      apiKey: KEY,
      userHash: "",
      setNumber: value,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  const instructions = response.data.instructions;

  if (!instructions || instructions.length === 0) {
    throw new Error(`No se encontraron instrucciones para el set ${value}`); // ✅ error correcto
  }

  const mergedPdf = await PDFDocument.create();

  // Tomar instrucciones en índices pares
  const instruccionsPDF = instructions.filter((_, i) => i % 2 === 0); // ✅ más limpio

  // Descargar PDFs en paralelo en lugar de secuencial
  const pdfBuffers = await Promise.all(
    instruccionsPDF.map((instruction) =>
      axios
        .get(instruction.URL, { responseType: "arraybuffer" })
        .then((r) => r.data),
    ),
  );

  for (const buffer of pdfBuffers) {
    const pdf = await PDFDocument.load(buffer);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save(); // ✅ retorna bytes, el router maneja el res
};

module.exports = { getInstruccions };
