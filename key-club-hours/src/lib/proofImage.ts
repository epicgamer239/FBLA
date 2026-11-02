import imageCompression from 'browser-image-compression';

export async function prepareProofImage(file: File): Promise<string> {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Proof must be an image file.');
  }

  // Validate file size (25 MB limit before compression)
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Image is too large (max 25 MB).');
  }

  // Check for HEIC/HEIF files
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

  // First compression attempt
  const options = {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    const dataUrl = await fileToDataUrl(compressedFile);

    // Check if compressed result is still too large
    if (dataUrl.length > 800000) {
      // Retry with more aggressive compression
      const retryOptions = {
        maxSizeMB: 0.15,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.6,
      };

      const retryCompressed = await imageCompression(file, retryOptions);
      const retryDataUrl = await fileToDataUrl(retryCompressed);

      if (retryDataUrl.length > 800000) {
        throw new Error('This photo is too large even after compression. Please use a smaller photo.');
      }

      return retryDataUrl;
    }

    return dataUrl;
  } catch (error) {
    // If compression fails for HEIC/HEIF, block with specific message
    if (isHeic) {
      throw new Error('HEIC/HEIF photos are not supported. Please convert to JPEG or PNG.');
    }

    // For non-HEIC files, try to use the original if it's small enough
    try {
      const originalDataUrl = await fileToDataUrl(file);
      if (originalDataUrl.length <= 800000) {
        return originalDataUrl;
      }
    } catch (fallbackError) {
      // Ignore fallback error
    }

    throw new Error('This photo is too large even after compression. Please use a smaller photo.');
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
