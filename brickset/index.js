import axios from "axios";
import { PDFDocument } from "pdf-lib";

// ⚠️ dotenv solo en local
if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const URL = process.env.BRICKSET_API_URL;
const KEY = process.env.BRICKSET_API_KEY;

const getInstruccions = async (value) => {
  console.log("ENV URL:", process.env.BRICKSET_API_URL);
  const response = await axios.post(
    URL,
    new URLSearchParams({
      apiKey: KEY,
      userHash: "",
      setNumber: value,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  const instructions = response.data.instructions;

  if (!instructions || instructions.length === 0) {
    throw new Error(`No se encontraron instrucciones para el set ${value}`);
  }

  const mergedPdf = await PDFDocument.create();

  // solo índices pares
  const instruccionsPDF = instructions.filter((_, i) => i % 2 === 0);

  // ⚠️ paralelo (rápido pero cuidado con límites)
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

  return await mergedPdf.save();
};

export { getInstruccions };
