// Prepare a bounded, centred identity image locally. Nothing is uploaded here.
export async function prepareCommunityImage(blob: Blob) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 6 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP image smaller than 6 MB.');
  }
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('We could not read your saved image. Please choose another image.'));
      image.src = source;
    });
    if (image.naturalWidth < 256 || image.naturalHeight < 256 || image.naturalWidth > 6000 || image.naturalHeight > 6000) {
      throw new Error('Choose an image between 256 and 6000 pixels on each side.');
    }
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(side, 1024);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the image. Please try another browser.');
    context.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, canvas.width, canvas.height);
    const prepared = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('We could not prepare that image.')), 'image/webp', .85));
    if (prepared.size > 3 * 1024 * 1024) throw new Error('That image is too large. Please choose a smaller image.');
    return new File([prepared], 'community-image.webp', {type:'image/webp'});
  } finally { URL.revokeObjectURL(source); }
}

// Put a complete image, or an explicitly chosen centre crop, into a bounded
// banner. The database still receives a real 1200 × 400 image, not fake metadata.
export async function prepareCommunityCover(blob: Blob, fit: 'whole' | 'fill' = 'whole') {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 8 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP cover up to 8 MB.');
  }
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('We could not read that image. Please choose another image.'));
      image.src = source;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width < 128 || height < 128 || width > 6000 || height > 6000) {
      throw new Error('Choose an image between 128 and 6000 pixels on each side. A larger image will look sharper.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 400;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the cover. Please try another browser.');
    context.fillStyle = '#f5f3ef';
    context.fillRect(0, 0, 1200, 400);
    if (fit === 'fill') {
      const cropWidth = Math.min(width, height * 3);
      const cropHeight = cropWidth / 3;
      context.drawImage(image, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, 1200, 400);
    } else {
      // Do not enlarge a small original or cut off text in a poster/logo.
      const scale = Math.min(1200 / width, 400 / height, 1);
      const outputWidth = width * scale;
      const outputHeight = height * scale;
      context.drawImage(image, 0, 0, width, height, (1200 - outputWidth) / 2, (400 - outputHeight) / 2, outputWidth, outputHeight);
    }
    const prepared = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('We could not prepare the cover. Please try another image.')), 'image/webp', .9);
    });
    if (prepared.size > 8 * 1024 * 1024 || !['image/webp', 'image/png', 'image/jpeg'].includes(prepared.type)) {
      throw new Error('We could not prepare the cover. Please try another image.');
    }
    const extension = prepared.type === 'image/webp' ? 'webp' : prepared.type === 'image/png' ? 'png' : 'jpg';
    return new File([prepared], `community-cover.${extension}`, {type: prepared.type});
  } finally {
    URL.revokeObjectURL(source);
  }
}
