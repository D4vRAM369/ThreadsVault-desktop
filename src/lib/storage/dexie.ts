import Dexie, { type Table } from 'dexie'
import type { StorageAdapter, ImportResult } from './adapter'
import type { Post, Category } from '../types'
import { normalizeBackupPayload } from './backup-normalizer'

const SCHEMA_VERSION = 2
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-default-1', name: 'General', color: '#7C4DFF', emoji: '📌', order: 0 },
  { id: 'cat-default-2', name: 'Inspiracion', color: '#00BCD4', emoji: '💡', order: 1 },
  { id: 'cat-default-3', name: 'Trabajo', color: '#26A69A', emoji: '💼', order: 2 },
]

class VaultDatabase extends Dexie {
  posts!: Table<Post>
  categories!: Table<Category>

  constructor() {
    super('threadsvault')
    this.version(1).stores({
      posts:      'id, categoryId, savedAt, author',
      categories: 'id, name',
    })
  }
}

export class DexieStorage implements StorageAdapter {
  private db: VaultDatabase
  private _ready: Promise<void>

  constructor() {
    this.db = new VaultDatabase()
    // Guardamos la promesa — getStorage() la awaita antes de devolver el adapter
    this._ready = this._seedDefaultCategories()
  }

  async init(): Promise<void> {
    await this._ready
  }

  private async _seedDefaultCategories() {
    const count = await this.db.categories.count()
    if (count === 0) {
      await this.db.categories.bulkAdd(DEFAULT_CATEGORIES)
    }
  }

  async getPosts(): Promise<Post[]> {
    return this.db.posts.orderBy('savedAt').reverse().toArray()
  }

  async getPost(id: string): Promise<Post | null> {
    return (await this.db.posts.get(id)) ?? null
  }

  async savePost(post: Post): Promise<void> {
    await this.db.posts.put(post)
  }

  async deletePost(id: string): Promise<void> {
    await this.db.posts.delete(id)
  }

  async getCategories(): Promise<Category[]> {
    const rows = await this.db.categories.toArray()
    return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  async saveCategory(cat: Category): Promise<void> {
    await this.db.categories.put(cat)
  }

  async deleteCategory(id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.posts, this.db.categories], async () => {
      // Reasignar posts huérfanos a "General" antes de borrar la categoría
      await this.db.posts.where('categoryId').equals(id).modify({ categoryId: 'cat-default-1' })
      await this.db.categories.delete(id)
    })
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
    const data = normalizeBackupPayload(JSON.parse(json))

    let catCount  = 0
    let postCount = 0
    let errors    = 0

    await this.db.transaction('rw', [this.db.posts, this.db.categories], async () => {
      await this.db.posts.clear()
      await this.db.categories.clear()

      for (const cat of data.categories) {
        try {
          await this.db.categories.put(cat)
          catCount++
        } catch {
          errors++
        }
      }

      for (const post of data.posts) {
        try {
          const cleanPost: Post = {
            ...post,
            previewImage: post.previewImage?.startsWith('data:') ? undefined : post.previewImage,
            previewVideo: post.previewVideo?.startsWith('data:') ? undefined : post.previewVideo,
            media: post.media?.filter(m => !m.url.startsWith('data:')),
          }
          await this.db.posts.put(cleanPost)
          postCount++
        } catch {
          errors++
        }
      }
    })

    return { posts: postCount, categories: catCount, errors }
  }
}
