import type { Post, Category } from '../types'

export interface StorageAdapter {
  // Posts
  getPosts(): Promise<Post[]>
  getPost(id: string): Promise<Post | null>
  savePost(post: Post): Promise<void>
  deletePost(id: string): Promise<void>

  // Categories
  getCategories(): Promise<Category[]>
  saveCategory(cat: Category): Promise<void>
  deleteCategory(id: string): Promise<void>

  // Backup
  exportBackup(): Promise<string>           // devuelve JSON string
  importBackup(json: string): Promise<void>
}
