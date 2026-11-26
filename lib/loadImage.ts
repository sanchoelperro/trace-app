/**
 * Decode an image (a file the user picked, or a stored Blob) into an
 * HTMLImageElement. Everything stays in the browser: the object URL points
 * at local memory. The caller should URL.revokeObjectURL(img.src) once the
 * pixels have been drawn somewhere, to free that memory.
 */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image"));
    };
    img.src = url;
  });
}
