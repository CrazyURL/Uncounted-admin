// ── IndexedDB key-value store ──────────────────────────────────────────────────
// localStorage 5MB 제한 대체: 세션 데이터를 IndexedDB에 저장 (50MB+ 용량)
// 실패 시 자동으로 localStorage 폴백

const DB_NAME = 'uncounted'
const DB_VERSION = 1
const STORE_NAME = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'))
        return
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null // 재시도 허용
        reject(req.error)
      }
    })
  }
  return dbPromise
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB()
    return new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await getDB()
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function idbDelete(key: string): Promise<boolean> {
  try {
    const db = await getDB()
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** stale DB 핸들 초기화 — indexedDB.deleteDatabase() 후 호출 */
export function invalidateIdbHandle(): void {
  dbPromise = null
}

/** 모든 데이터 삭제 (캐시 초기화) */
export async function idbClearAll(): Promise<boolean> {
  try {
    const db = await getDB()
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** prefix로 시작하는 모든 키 조회 (예: "stt:" → ["stt:abc", "stt:def"]) */
export async function idbGetKeysByPrefix(prefix: string): Promise<string[]> {
  try {
    const db = await getDB()
    return new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      // IDBKeyRange로 prefix 범위 검색
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false)
      const req = store.getAllKeys(range)
      req.onsuccess = () => resolve(req.result as string[])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}
