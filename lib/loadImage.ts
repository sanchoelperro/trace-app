/**
 * Decode an image file chosen by the user into an HTMLImageElement.
 * Everything stays in the browser: the object URL points at local memory.
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image "${file.name}"`));
    img.src = URL.createObjectURL(file);
  });
}
