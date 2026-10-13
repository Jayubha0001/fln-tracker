import Dexie from 'dexie';

// Data aa device na browser ma j save thay (offline chale, internet ni jarur nahi)
export const db = new Dexie('fln-tracker');
db.version(1).stores({
  students: '++id, dhoran, name',
  entries: 'id, studentId, month, dhoran',
});
