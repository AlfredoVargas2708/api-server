import JsGoogleTranslateFree from "@kreisler/js-google-translate-free";

const cache = new Map();

const translation = async (text, target = "es") => {
  if (!text) return text;

  const key = `${text}:${target}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const result = await JsGoogleTranslateFree.translate({ text, to: target });

    cache.set(key, result);
    return result;
  } catch (error) {
    console.error("Error translating:", error.message);
    return text;
  }
};

export { translation };
