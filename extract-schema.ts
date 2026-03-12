import Database from 'better-sqlite3';
const db = new Database('database.sqlite');
const tables = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(t.sql + ';\n'));
