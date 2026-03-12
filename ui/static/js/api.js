export async function fetchJSON(url, options = {}) {
  const $ = window.jQuery;
  const method = options.method || "GET";
  const headers = { ...(options.headers || {}) };
  const contentType = headers["Content-Type"] || headers["content-type"];

  delete headers["Content-Type"];
  delete headers["content-type"];

  function parsePayload(rawPayload) {
    if (typeof rawPayload !== "string") {
      return rawPayload;
    }
    try {
      return JSON.parse(rawPayload);
    } catch {
      return rawPayload;
    }
  }

  return new Promise((resolve, reject) => {
    $.ajax({
      url,
      method,
      headers,
      data: options.body,
      contentType,
      processData: !(contentType && typeof options.body === "string"),
      success(data, _textStatus, jqXHR) {
        const payload = data ?? jqXHR.responseText;
        resolve(payload);
      },
      error(jqXHR, textStatus) {
        const payload = parsePayload(jqXHR.responseJSON ?? jqXHR.responseText);
        const bundleValidationMessage = Array.isArray(payload?.validation?.errors)
          ? payload.validation.errors
            .map((item) => item?.message)
            .filter(Boolean)
            .join("; ")
          : null;
        const detailValidationMessage = Array.isArray(payload?.detail?.errors)
          ? payload.detail.errors
            .map((item) => item?.message)
            .filter(Boolean)
            .join("; ")
          : null;
        const validationMessage = Array.isArray(payload?.detail)
          ? payload.detail
            .map((item) => item?.msg || item?.message)
            .filter(Boolean)
            .join("; ")
          : null;
        const message =
          bundleValidationMessage ||
          detailValidationMessage ||
          validationMessage ||
          (payload && typeof payload === "object" && (payload.detail || payload.message)) ||
          (typeof payload === "string" && payload) ||
          jqXHR.statusText ||
          textStatus ||
          "Request failed";
        const error = new Error(typeof message === "string" ? message : "Request failed");
        error.status = jqXHR.status;
        if (payload && typeof payload === "object") {
          error.detail = payload.detail;
          error.code = payload.code;
        }
        reject(error);
      },
    });
  });
}
