import { useEffect, useState } from 'react';
import { loadPickerPrefs, savePickerPrefs, type FilterKey } from '../lib/pickerData';

/** The card picker's filters and sort order, remembered for the session. */
export function usePickerPrefs() {
  const [initialPrefs] = useState(loadPickerPrefs);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set(initialPrefs.filters));
  const [sortIndex, setSortIndex] = useState(initialPrefs.sortIndex);
  const [descending, setDescending] = useState(initialPrefs.descending);

  useEffect(() => {
    savePickerPrefs({ filters: [...filters], sortIndex, descending });
  }, [filters, sortIndex, descending]);

  return { filters, setFilters, sortIndex, setSortIndex, descending, setDescending };
}
