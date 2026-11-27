import { projects } from '../content/site';

export async function createPosterAtlas(): Promise<{
  canvas: HTMLCanvasElement;
  count: number;
  columns: number;
  rows: number;
}> {
  const columns = 4;
  const rows = 4;
  const tileWidth = 512;
  const tileHeight = 768;
  const gutter = 2;
  const width = tileWidth - gutter * 2;
  const height = tileHeight - gutter * 2;
  const margin = 28;
  const measure = width - margin * 2;
  const ivory = '#f2efe5';
  const ink = '#111318';
  const blue = '#2e5bff';
  const acid = '#d9f64b';

  const entries = projects.flatMap((project, projectIndex) => {
    const detail = project.images[0];
    if (!detail) throw new Error(`Missing poster detail image for ${project.slug}`);
    return [
      { project, projectIndex, src: project.cover, detail: false },
      { project, projectIndex, src: detail.src, detail: true },
    ];
  });
  if (entries.length !== 14) throw new Error('The poster atlas requires seven projects');

  await Promise.all([
    document.fonts.load('700 120px "Space Grotesk"'),
    document.fonts.load('500 12px "Inter"'),
  ]);
  await document.fonts.ready;

  const posters = await Promise.all(
    entries.map(async (entry) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = entry.src;
      await image.decode();
      return { ...entry, image };
    }),
  );

  const canvas = document.createElement('canvas');
  canvas.width = tileWidth * columns;
  canvas.height = 4096;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D is required to create the poster atlas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const block = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  const title = (
    value: string,
    x: number,
    baseline: number,
    size: number,
    color: string,
    maxWidth = measure,
  ) => {
    ctx.font = `700 ${size}px "Space Grotesk", sans-serif`;
    const fittedSize = size * Math.min(1, maxWidth / Math.max(1, ctx.measureText(value).width));
    ctx.font = `700 ${fittedSize}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(value.toUpperCase(), x, baseline);
  };

  const label = (
    value: string,
    x: number,
    baseline: number,
    color: string,
    align: CanvasTextAlign = 'left',
  ) => {
    ctx.font = '500 12px "Inter", "PingFang SC", sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(value, x, baseline);
  };

  const photo = (
    image: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    focusX = 0.5,
    focusY = 0.5,
  ) => {
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const sourceWidth = w / scale;
    const sourceHeight = h / scale;
    ctx.drawImage(
      image,
      (image.naturalWidth - sourceWidth) * focusX,
      (image.naturalHeight - sourceHeight) * focusY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      w,
      h,
    );
  };

  const header = (color: string, baseline = 34) => {
    label('方块之家 BOH', margin, baseline, color);
    block(margin, baseline + 14, measure, 1, color);
  };

  const footer = (color: string, index: number) => {
    label('SELECTED WORK / 虚构演示', margin, height - 23, color);
    label(
      `${String(index + 1).padStart(2, '0')} / 14`,
      width - margin,
      height - 23,
      color,
      'right',
    );
  };

  posters.forEach(({ project, projectIndex, detail, image }, index) => {
    ctx.save();
    ctx.translate(
      (index % columns) * tileWidth + gutter,
      Math.floor(index / columns) * tileHeight + gutter,
    );
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    const variant = projectIndex % 4;
    const dark = variant === 0 || variant === 2;
    const background = variant === 1 ? ivory : variant === 3 ? acid : ink;
    const foreground = dark ? ivory : ink;
    block(0, 0, width, height, background);

    if (variant === 0) {
      header(foreground);
      title(project.title, margin, detail ? 154 : 174, detail ? 104 : 122, foreground);
      label(project.category, margin, detail ? 188 : 212, foreground);
      photo(image, 0, detail ? 218 : 244, width, detail ? 482 : 456);
      block(0, detail ? 700 : 700, width, 8, blue);
    } else if (variant === 1) {
      photo(image, 0, 0, width, height);
      block(0, 0, width, 74, ivory);
      block(0, 646, width, 78, ivory);
      header(ink, 34);
      title(project.title, margin, 724, 104, ink);
      label(project.category, width - margin, 724, blue, 'right');
    } else if (variant === 2) {
      block(0, 0, width, height, blue);
      photo(image, 124, 0, width - 124, height);
      block(0, 0, 124, height, blue);
      header(ivory, 34);
      ctx.save();
      ctx.translate(102, 702);
      ctx.rotate(-Math.PI / 2);
      title(project.title, 0, 0, 92, ivory, 560);
      ctx.restore();
      label(project.category, 146, 724, ivory);
    } else {
      photo(image, margin, 78, measure, 454);
      block(margin, 554, measure, 1, ink);
      label(project.category, margin, 584, ink);
      label(project.year, width - margin, 584, ink, 'right');
      title(project.title, margin, 700, 112, ink);
      block(width - 112, 622, 84, 84, blue);
    }

    footer(variant === 2 ? ivory : foreground, index);
    ctx.restore();
  });

  return { canvas, count: entries.length, columns, rows };
}
