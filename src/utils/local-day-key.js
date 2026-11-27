export const getLocalDayKey = (date = new Date()) => {
  const source = date instanceof Date ? date : new Date(date);
  if (!(source instanceof Date) || Number.isNaN(source.getTime())) return '';
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, '0');
  const day = String(source.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
