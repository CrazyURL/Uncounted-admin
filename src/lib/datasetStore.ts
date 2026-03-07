import { type Dataset } from '../types/dataset'

const STORAGE_KEY = 'uncounted_admin_datasets'

function readAll(): Dataset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Dataset[]
  } catch {
    return []
  }
}

function writeAll(datasets: Dataset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datasets))
}

export function loadDatasets(): Dataset[] {
  return readAll()
}

export function getDatasetById(id: string): Dataset | null {
  return readAll().find(d => d.id === id) ?? null
}

export function saveDataset(dataset: Dataset): void {
  const all = readAll()
  const idx = all.findIndex(d => d.id === dataset.id)
  if (idx >= 0) {
    all[idx] = dataset
  } else {
    all.push(dataset)
  }
  writeAll(all)
}

export function deleteDataset(id: string): void {
  writeAll(readAll().filter(d => d.id !== id))
}
