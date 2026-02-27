import Database from '@tauri-apps/plugin-sql'
import type { StorageAdapter } from './adapter'
import type { Post, Category } from '../types'

const SCHEMA_VERSION = 1
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-default-1', name: 'General',     color: '#7C4DFF' },
  { id: 'cat-default-2', name: 'Inspiración', color: '#00BCD4' },
  { id: 'cat-default-3', name: 'Trabajo',     color: '#26A69A' },
]

export class SqliteStorage implements StorageAdapter {
  private db!: Database

  async init(): Promise<void> {
    this.db = await Database.load('sqlite:threadsvault.db')
    await this._createTables()
    await this._seedDefaultCategories()
  }

  private async _createTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id           TEXT PRIMARY KEY,
        url          TEXT NOT NULL,
        author       TEXT NOT NULL,
        note         TEXT NOT NULL DEFAULT '',
        categoryId   TEXT NOT NULL,
        savedAt      INTEGER NOT NULL,
        previewTitle TEXT,
        previewImage TEXT
      )
    `)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id    TEXT PRIMARY KEY,
        name  TEXT NOT NULL,
        color TEXT NOT NULL
      )
    `)
  }

  private async _seedDefaultCategories(): Promise<void> {
    const rows = await this.db.select<Category[]>('SELECT id FROM categories LIMIT 1')
    if (rows.length === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await this.saveCategory(cat)
      }
    }
  }

  async getPosts(): Promise<Post[]> {
    return this.db.select<Post[]>('SELECT * FROM posts ORDER BY savedAt DESC')
  }

  async getPost(id: string): Promise<Post | null> {
    const rows = await this.db.select<Post[]>('SELECT * FROM posts WHERE id = $1', [id])
    return rows[0] ?? null
  }

  async savePost(post: Post): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO posts
        (id, url, author, note, categoryId, savedAt, previewTitle, previewImage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [post.id, post.url, post.author, post.note, post.categoryId,
       post.savedAt, post.previewTitle ?? null, post.previewImage ?? null]
    )
  }

  async deletePost(id: string): Promise<void> {
    await this.db.execute('DELETE FROM posts WHERE id = $1', [id])
  }

  async getCategories(): Promise<Category[]> {
    return this.db.select<Category[]>('SELECT * FROM categories')
  }

  async saveCategory(cat: Category): Promise<void> {
    await this.db.execute(
      'INSERT OR REPLACE INTO categories (id, name, color) VALUES ($1,$2,$3)',
      [cat.id, cat.name, cat.color]
    )
  }

  async deleteCategory(id: string): Promise<void> {
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

  async importBackup(json: string): Promise<void> {
    const data = JSON.parse(json)
    if (!data.schemaVersion || !data.posts || !data.categories) {
      throw new Error('Formato de backup inválido')
    }
    await this.db.execute('DELETE FROM posts')
    await this.db.execute('DELETE FROM categories')
    for (const post of data.posts) await this.savePost(post)
    for (const cat of data.categories) await this.saveCategory(cat)
  }
}
