import axios from "axios";

// ⚠️ dotenv solo en local (opcional)
if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const URL = process.env.REBRICKABLE_URL;
const KEY = process.env.REBRICKABLE_KEY;

const rebrickData = async (column, value) => {
  try {
    const url = `${URL}/${column === "lego" ? `sets/${value}-1` : `elements/${value}`}`;

    let response = await axios.get(url, {
      headers: {
        Authorization: `key ${KEY}`,
      },
    });

    if (column === "lego") {
      const themeId = response.data.theme_id;

      const themeResponseData = await themeResponse(themeId);

      if (themeResponseData.data.parent_id) {
        const finalThemeResponse = await themeResponse(
          themeResponseData.data.parent_id
        );

        response.data.set_nombre = finalThemeResponse.data.name;
      } else {
        response.data.set_nombre = themeResponseData.data.name;
      }
    }

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const piezasSetData = async (value, pageSize = 100) => {
  try {
    let url = `${URL}/sets/${value}-1/parts/?page_size=${pageSize}`;
    let allResults = [];
    let count = 0;

    while (url) {
      const response = await axios.get(url, {
        headers: {
          Authorization: `key ${KEY}`,
        },
      });

      const data = response.data;

      count = data.count;
      allResults = [...allResults, ...data.results];

      url = data.next;
    }

    return { count, results: allResults };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const setsPiezaData = async (part, color_id, pageSize = 100) => {
  try {
    let url = `${URL}/parts/${part}/colors/${color_id}/sets/?page_size=${pageSize}`;
    let allResults = [];
    let count = 0;

    while (url) {
      const response = await axios.get(url, {
        headers: {
          Authorization: `key ${KEY}`,
        },
      });

      const data = response.data;

      count = data.count;
      allResults = [...allResults, ...data.results];

      url = data.next;
    }

    return { count, results: allResults };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const piezasColorsData = async () => {
  try {
    const pageSize = 100;
    const url = `${URL}/colors/?page_size=${pageSize}`;

    const first = await axios.get(url, {
      headers: { Authorization: `key ${KEY}` },
    });

    const totalPages = Math.ceil(first.data.count / pageSize);

    if (totalPages <= 1) {
      return { count: first.data.count, results: first.data.results };
    }

    const requests = Array.from({ length: totalPages - 1 }, (_, i) =>
      axios.get(`${url}&page=${i + 2}`, {
        headers: { Authorization: `key ${KEY}` },
      })
    );

    const responses = await Promise.all(requests);

    const allResults = [
      ...first.data.results,
      ...responses.flatMap((r) => r.data.results),
    ];

    return {
      count: first.data.count,
      results: allResults,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const themeResponse = async (themeId) => {
  const themeIdURL = `${URL}/themes/${themeId}`;
  return await axios.get(themeIdURL, {
    headers: {
      Authorization: `key ${KEY}`,
    },
  });
};

export {
  rebrickData,
  piezasSetData,
  setsPiezaData,
  piezasColorsData,
};