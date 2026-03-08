import Database from '@tauri-apps/plugin-sql'
import type { StorageAdapter, ImportResult } from './adapter'
import type { Post, Category } from '../types'
import { normalizeBackupPayload } from './backup-normalizer'

const SCHEMA_VERSION = 2
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-default-1', name: 'General', color: '#7C4DFF', emoji: '📌', order: 0 },
  { id: 'cat-default-2', name: 'Inspiracion', color: '#00BCD4', emoji: '💡', order: 1 },
  { id: 'cat-default-3', name: 'Trabajo', color: '#26A69A', emoji: '💼', order: 2 },
]

interface SqlitePostRow {
  id: string
  url: string
  author: string
  note: string
  categoryId: string
  savedAt: number
  previewTitle: string | null
  previewImage: string | null
  previewVideo: string | null
  extractedText: string | null
  canonicalUrl: string | null
  mediaJson: string | null
  threadPostsJson: string | null
}

interface SqliteCategoryRow {
  id: string
  name: string
  color: string
  emoji: string | null
  order: number | null
}

export class SqliteStorage implements StorageAdapter {
  private db!: Database

  async init(): Promise<void> {
    this.db = await Database.load('sqlite:threadsvault.db')
    await this._createTables()
    await this._runMigrations()
    await this._seedDefaultCategories()
  }

  private async _createTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id            TEXT PRIMARY KEY,
        url           TEXT NOT NULL,
        author        TEXT NOT NULL,
        note          TEXT NOT NULL DEFAULT '',
        categoryId    TEXT NOT NULL,
        savedAt       INTEGER NOT NULL,
        previewTitle  TEXT,
        previewImage  TEXT,
        previewVideo  TEXT,
        extractedText TEXT,
        canonicalUrl  TEXT,
        mediaJson     TEXT
      )
    `)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        color     TEXT NOT NULL,
        emoji     TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  private async _runMigrations(): Promise<void> {
    await this._ensureColumn('posts', 'previewVideo', 'TEXT')
    await this._ensureColumn('posts', 'extractedText', 'TEXT')
    await this._ensureColumn('posts', 'canonicalUrl', 'TEXT')
    await this._ensureColumn('posts', 'mediaJson', 'TEXT')
    await this._ensureColumn('posts', 'threadPostsJson', 'TEXT')
    await this._ensureColumn('categories', 'emoji', 'TEXT')
    await this._ensureColumn('categories', 'sortOrder', 'INTEGER NOT NULL DEFAULT 0')
  }

  private async _ensureColumn(table: string, column: string, sqlType: string): Promise<void> {
    const rows = await this.db.select<Array<{ name: string }>>(`PRAGMA table_info(${table})`)
    const hasColumn = rows.some((row) => row.name === column)
    if (!hasColumn) {
      await this.db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`)
    }
  }

  private async _seedDefaultCategories(): Promise<void> {
    const rows = await this.db.select<Category[]>('SELECT id FROM categories LIMIT 1')
    if (rows.length === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await this.saveCategory(cat)
      }
    }
  }

  private _rowToPost(row: SqlitePostRow): Post {
    let media = undefined
    if (row.mediaJson) {
      try {
        media = JSON.parse(row.mediaJson)
      } catch {
        media = undefined
      }
    }

    let threadPosts = undefined
    if (row.threadPostsJson) {
      try {
        threadPosts = JSON.parse(row.threadPostsJson)
      } catch {
        threadPosts = undefined
      }
    }

    return {
      id: row.id,
      url: row.url,
      author: row.author,
      note: row.note,
      categoryId: row.categoryId,
      savedAt: row.savedAt,
      previewTitle: row.previewTitle ?? undefined,
      previewImage: row.previewImage ?? undefined,
      previewVideo: row.previewVideo ?? undefined,
      extractedText: row.extractedText ?? undefined,
      canonicalUrl: row.canonicalUrl ?? undefined,
      media,
      threadPosts,
    }
  }

  async getPosts(): Promise<Post[]> {
    const rows = await this.db.select<SqlitePostRow[]>('SELECT * FROM posts ORDER BY savedAt DESC')
    return rows.map((row) => this._rowToPost(row))
  }

  async getPost(id: string): Promise<Post | null> {
    const rows = await this.db.select<SqlitePostRow[]>('SELECT * FROM posts WHERE id = $1', [id])
    return rows[0] ? this._rowToPost(rows[0]) : null
  }

  async savePost(post: Post): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO posts
        (id, url, author, note, categoryId, savedAt, previewTitle, previewImage, previewVideo, extractedText, canonicalUrl, mediaJson, threadPostsJson)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        post.id,
        post.url,
        post.author,
        post.note,
        post.categoryId,
        post.savedAt,
        post.previewTitle ?? null,
        post.previewImage ?? null,
        post.previewVideo ?? null,
        post.extractedText ?? null,
        post.canonicalUrl ?? null,
        post.media?.length ? JSON.stringify(post.media) : null,
        post.threadPosts?.length ? JSON.stringify(post.threadPosts) : null,
      ]
    )
  }

  async deletePost(id: string): Promise<void> {
    await this.db.execute('DELETE FROM posts WHERE id = $1', [id])
  }

  async getCategories(): Promise<Category[]> {
    const rows = await this.db.select<SqliteCategoryRow[]>(
      'SELECT id, name, color, emoji, sortOrder as "order" FROM categories ORDER BY sortOrder ASC, name ASC'
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      emoji: row.emoji ?? undefined,
      order: row.order ?? 0,
    }))
  }

  async saveCategory(cat: Category): Promise<void> {
    await this.db.execute(
      'INSERT OR REPLACE INTO categories (id, name, color, emoji, sortOrder) VALUES ($1,$2,$3,$4,$5)',
      [cat.id, cat.name, cat.color, cat.emoji ?? null, cat.order ?? 0]
    )
  }

  async deleteCategory(id: string): Promise<void> {
    // Reasignar posts huérfanos a "General" antes de borrar la categoría
    await this.db.execute(
      "UPDATE posts SET categoryId = 'cat-default-1' WHERE categoryId = $1",
      [id]
    )
    await this.db.execute('DELETE FROM categories WHERE id = $1', [id])
  }

  async exportBackup(): Promise<string> {
    const posts = await this.getPosts()
    const categories = await this.getCategories()
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      posts,
      categories,
    }, null, 2)
  }

  async importBackup(json: string): Promise<ImportResult> {
    // Normalizar y validar los datos ANTES de tocar la base de datos.
    // Si esto lanza, la DB no ha sido modificada.
    const data = normalizeBackupPayload(JSON.parse(json))

    // IMPORTANTE: @tauri-apps/plugin-sql usa un pool de conexiones SQLite.
    // Cada execute() puede ir a una conexión diferente del pool, por lo que
    // BEGIN TRANSACTION / COMMIT / ROLLBACK en llamadas separadas NO garantizan
    // atomicidad — las operaciones pueden ejecutarse en conexiones distintas.
    //
    // Estrategia: auto-commit por statement + manejo de errores por-item.
    // Las categorías se insertan primero (los posts referencian categoryId).
    // Los posts se importan con data URLs eliminadas para evitar payloads
    // enormes en el IPC de Tauri (imágenes cacheadas en base64 pueden ser >5MB).

    // 1. Borrar datos existentes
    await this.db.execute('DELETE FROM posts')
    await this.db.execute('DELETE FROM categories')

    let catCount  = 0
    let postCount = 0
    let errors    = 0

    // 2. Insertar categorías primero (pequeñas, rápidas, nunca tienen data URLs)
    for (const cat of data.categories) {
      try {
        await this.saveCategory(cat)
        catCount++
      } catch {
        errors++
      }
    }

    // 3. Insertar posts — eliminar data URLs para evitar fallos IPC por payload grande
    for (const post of data.posts) {
      try {
        const cleanPost: Post = {
          ...post,
          previewImage: post.previewImage?.startsWith('data:') ? undefined : post.previewImage,
          previewVideo: post.previewVideo?.startsWith('data:') ? undefined : post.previewVideo,
          media: post.media?.filter(m => !m.url.startsWith('data:')),
        }
        await this.savePost(cleanPost)
        postCount++
      } catch {
        errors++
      }
    }

    return { posts: postCount, categories: catCount, errors }
  }
}
