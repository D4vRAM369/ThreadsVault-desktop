export interface DesktopVideoResolution {
  playableUrl?: string
  downloadUrl?: string
  reason?: string
  source: 'desktop'
}

export interface DesktopVideoDownloadResult {
  filePath: string
  fileName: string
  downloadDir: string
  source: 'seal-plus'
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function resolveDesktopVideo(postUrl: string): Promise<DesktopVideoResolution | null> {
  if (!isTauriEnvironment()) return null

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<DesktopVideoResolution>('resolve_threads_video', { postUrl })
  } catch (error) {
    console.warn('No se pudo invocar el resolver desktop de video', error)
    return null
  }
}

export async function downloadDesktopVideo(postUrl: string): Promise<DesktopVideoDownloadResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<DesktopVideoDownloadResult>('download_threads_video', { postUrl })
}
