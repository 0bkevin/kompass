import Busboy from "busboy";
import multer from "multer";
import { isUtf8 } from "node:buffer";
import path from "node:path";

// Compare the parser's two supported default charsets before Multer reads the
// filename. Explicit filename* charsets yield the same name in both parsers and
// must never be decoded again. Bare filename bytes prefer valid UTF-8, falling
// back to Latin-1 without inserting replacement characters.
export function filenameAwareUpload(options) {
  return multer({
    ...options,
    defParamCharset: "latin1",
    streamHandler(req, parser) {
      const metadata = Busboy({
        headers: req.headers,
        defParamCharset: "utf8",
        preservePath: options.preservePath,
        limits: { ...options.limits, fileSize: 0 },
      });
      let utf8Name;
      let stopped = false;
      function stopMetadata() {
        if (stopped) return;
        stopped = true;
        req.unpipe(metadata);
        for (const event of ["end", "close", "aborted", "error"])
          req.off(event, stopMetadata);
        parser.off("error", stopMetadata);
        parser.off("close", stopMetadata);
        parser.off("file", selectFilename);
        metadata.destroy();
      }
      function selectFilename(_field, _stream, info) {
        if (
          typeof info.filename === "string" &&
          typeof utf8Name === "string" &&
          info.filename !== utf8Name &&
          !/[^\u0000-\u00ff]/u.test(info.filename)
        ) {
          const bytes = Buffer.from(info.filename, "latin1");
          if (isUtf8(bytes) && bytes.toString("utf8") === utf8Name)
            info.filename = utf8Name;
        }
        // The metadata parser is detached as soon as the first file's header
        // has been consumed. Multer alone streams and stores the file body.
        stopMetadata();
      }
      metadata.on("file", (_field, stream, info) => {
        utf8Name = info.filename;
        stream.on("error", () => {});
        stream.resume();
      });
      metadata.on("error", stopMetadata);
      for (const event of ["partsLimit", "filesLimit", "fieldsLimit"])
        metadata.on(event, stopMetadata);
      for (const event of ["end", "close", "aborted", "error"])
        req.once(event, stopMetadata);
      parser.once("error", stopMetadata);
      parser.once("close", stopMetadata);
      parser.prependOnceListener("file", selectFilename);
      // Feed metadata first so its filename is available synchronously when
      // the authoritative Multer parser emits the matching file event.
      req.pipe(metadata);
      req.pipe(parser);
    },
  });
}

export function cleanUploadName(originalName) {
  const name = path.win32
    .basename(path.posix.basename(originalName))
    .replace(/[\u0000-\u001F\u007F]/g, "");
  if (!name || name === "." || name === "..") return "Archivo";
  if (name.length <= 200) return name;
  const extension = path.extname(name);
  const suffix = extension.length < 200 ? extension : "";
  const stem = name.slice(0, name.length - suffix.length);
  // Keep the existing 200 UTF-16-unit limit, without splitting a surrogate
  // pair or dropping a normal extension when shortening the base name.
  return (
    stem.slice(0, 200 - suffix.length).replace(/[\uD800-\uDBFF]$/, "") + suffix
  );
}

export function encodedDownloadName(name) {
  return encodeURIComponent(name).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
