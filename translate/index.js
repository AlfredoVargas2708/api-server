import JsGoogleTranslateFree from "@kreisler/js-google-translate-free";

// instancia única (importante en serverless)
const translator = new JsGoogleTranslateFree();

// Cache simple
const cache = new Map();

const translation = async (text, target = "es") => {
  if (!text) return text;

  const key = `${text}:${target}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const result = await translator.translate({
      text,
      to: target,
    });

    const translated = result;

    cache.set(key, translated);
    return translated;
  } catch (error) {
    console.error("Error translating:", error.message);
    return text; // fallback
  }
};

export { translation };