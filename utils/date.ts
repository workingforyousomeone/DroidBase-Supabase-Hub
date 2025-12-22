
export const formatDateDMY = (date: string | Date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB'); 
  // en-GB = dd/mm/yyyy
};
