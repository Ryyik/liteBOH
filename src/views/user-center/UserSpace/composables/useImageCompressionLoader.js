export const useImageCompressionLoader = () => {
  let imageCompressionLoader = null;

  const loadImageCompression = async () => {
    if (!imageCompressionLoader) {
      imageCompressionLoader = import('browser-image-compression')
        .then((mod) => mod.default)
        .catch((error) => {
          imageCompressionLoader = null;
          throw error;
        });
    }
    return imageCompressionLoader;
  };

  return { loadImageCompression };
};
