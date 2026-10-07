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
